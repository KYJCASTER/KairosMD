/**
 * 导出自包含 HTML：从运行时样式表收集 .k-md / .katex 规则与主题变量，
 * 本地图片（/kfs）与 KaTeX 字体转 base64 内嵌，单文件离线可看。
 */
import { themeEngine } from '../themes/engine'

const MAX_IMG_BYTES = 4 * 1024 * 1024
const MAX_FONT_BYTES = 1024 * 1024

export async function buildExportHtml(html: string, title: string): Promise<string> {
  let css = collectRules((t) => t.includes('.k-md'))
  if (html.includes('katex')) {
    css += await inlineFontUrls(collectRules((t) => t.includes('.katex')))
  }
  css = themeVars(css) + '\n' + css

  const body = await inlineImages(html)
  const dark = themeEngine.current.dark ? ' class="k-dark"' : ''

  return `<!doctype html>
<html lang="zh-CN"${dark}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
html{scroll-behavior:smooth}
body{margin:0;background:var(--k-bg);color:var(--k-text);font-family:var(--k-ff);font-size:var(--k-fs);line-height:var(--k-lh)}
${css}
</style>
</head>
<body>
<article class="k-md">
${body}
</article>
</body>
</html>
`
}

/** 从已加载的样式表里收集符合条件的规则文本（.k-md / .katex 均为应用内联样式，可读） */
function collectRules(filter: (text: string) => boolean): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText
      if (filter(text)) chunks.push(text)
    }
  }
  return chunks.join('\n')
}

/** 主题变量：按 CSS 文本里实际引用到的 --k-* 逐个取计算值 */
function themeVars(css: string): string {
  const names = new Set(css.match(/--k-[a-z0-9-]+/g) ?? [])
  names.add('--k-bg')
  names.add('--k-text')
  const cs = getComputedStyle(document.documentElement)
  const decls: string[] = []
  for (const n of names) {
    const v = cs.getPropertyValue(n).trim()
    if (v) decls.push(`${n}:${v}`)
  }
  return `:root{${decls.join(';')}}`
}

/** 本地图片（/kfs?…）转 dataURL 内嵌，超限或失败保留原引用 */
async function inlineImages(html: string): Promise<string> {
  return replaceAsync(html, /(src=")(\/kfs\?[^"]+)(")/g, async (m, pre: string, url: string, post: string) => {
    const data = await toDataUrl(url, MAX_IMG_BYTES)
    return data ? pre + data + post : m
  })
}

/** 字体文件同源绝对路径 → dataURL 内嵌（KaTeX 离线可用） */
async function inlineFontUrls(css: string): Promise<string> {
  const urls = [...new Set((css.match(/url\((['"]?)(\/[^)'"]+)\1\)/g) ?? []).map((u) => u.match(/\/[^)'"]+/)![0]))]
  for (const u of urls) {
    const data = await toDataUrl(u, MAX_FONT_BYTES)
    if (data) css = css.split(u).join(data)
  }
  return css
}

async function toDataUrl(url: string, maxBytes: number): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size > maxBytes) return null
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function replaceAsync(
  s: string,
  re: RegExp,
  fn: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...s.matchAll(re)]
  const results: string[] = []
  for (const m of matches) {
    results.push(await fn(...(m.slice() as unknown as string[])))
  }
  let out = ''
  let last = 0
  let r = 0
  for (const m of matches) {
    out += s.slice(last, m.index) + results[r++]
    last = m.index + m[0].length
  }
  return out + s.slice(last)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
