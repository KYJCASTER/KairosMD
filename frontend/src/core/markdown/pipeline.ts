/**
 * Markdown 渲染管线：唯一渲染入口。
 * - 标题打锚点并抽取 TOC
 * - 相对路径图片重写到 /kfs?path=<绝对路径>
 * - 链接分类（外部 / .md 文件 / 锚点），交给阅读视图点击委托处理
 * - 任务列表勾选框
 * - Shiki 代码高亮 + KaTeX 公式 + 脚注
 * - 插件可注入 markdown-it 插件与 fence 钩子
 */
import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import katex from '@vscode/markdown-it-katex'
import DOMPurify from 'dompurify'
import type { TocItem } from '../types'
import { bus } from '../events'
import { highlightCode, escapeHtml } from './shiki'
import { themeEngine } from '../themes/engine'

// markdown-it 的 render rule 回调签名：参数类型跨版本稳定，这里用宽松内联类型
// 避开 @types/markdown-it 的 export = namespace 在 ESM import 下的类型访问限制
type MdToken = {
  type: string
  tag: string
  info: string
  content: string
  /** 块级 token 的源码行范围 [起始行, 结束行]（0 基），用于滚动同步 */
  map?: [number, number] | null
  children?: MdToken[] | null
  attrs?: Array<[string, string]> | null
  attrIndex(name: string): number
  attrSet(name: string, value: string): void
  attrJoin(name: string, value: string): void
}
type MdRenderer = {
  renderToken(tokens: MdToken[], idx: number, options: unknown): string
}
type MdEnv = RenderEnv
type MdRule = (tokens: MdToken[], idx: number, opts: unknown, env: MdEnv, slf: MdRenderer) => string

export interface RenderCtx {
  filePath: string
}

export interface RenderResult {
  html: string
  toc: TocItem[]
}

export type MdPluginFn = (md: MarkdownIt) => void

export interface RenderHook {
  id: string
  /** 代码块拦截（如 mermaid）；返回 undefined 走默认高亮 */
  fence?: (code: string, lang: string, ctx: RenderCtx) => string | undefined
  /** HTML 后处理（字符串级） */
  afterRender?: (html: string, ctx: RenderCtx) => string
}

interface RenderEnv {
  ids: Map<number, string>
  toc: TocItem[]
  used: Map<string, number>
  ctx: RenderCtx
}

function slugify(text: string, used: Map<string, number>): string {
  let slug = text
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '')
  if (!slug) slug = 'h'
  const n = used.get(slug) ?? 0
  used.set(slug, n + 1)
  return n === 0 ? slug : `${slug}-${n}`
}

function inlineText(tokens: unknown[]): string {
  const t = (tokens.find((x) => (x as MdToken | undefined)?.type === 'inline') as MdToken | undefined) ?? undefined
  if (!t) return ''
  return (t.children ?? []).map((c: MdToken) => c.content).join('')
}

/** 相对路径 → /kfs 绝对路径（正斜杠形式） */
export function resolveAsset(src: string, filePath: string): string {
  if (/^(https?:|data:|blob:|\/\/)/i.test(src)) return src
  const clean = decodeURIComponent(src.split(/[?#]/)[0])
  if (!clean || clean.startsWith('/kfs')) return src
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
  const parts = (dir ? dir.split('/') : [])
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/kfs?path=' + encodeURIComponent(parts.join('/'))
}

/**
 * 净化渲染产物：raw HTML 直通（html:true）+ v-html 下，不可信 Markdown 可注入
 * `<img onerror>` / `<svg onload>` / `<iframe srcdoc>` 等执行向量。
 * 事件属性默认全移除；data-* 默认保留（data-k-ext / data-k-md / data-line 等内部标记）。
 * Shiki 的 style="color:..." 与 KaTeX 的 class 均保留。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'script', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcdoc'],
  })
}

class Pipeline {
  private md: MarkdownIt
  private mdPlugins: MdPluginFn[] = []
  private hooks: RenderHook[] = []

  constructor() {
    this.md = this.build()
  }

  private build(): MarkdownIt {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false })
      .use(footnote)
      .use(katex as unknown as (md: MarkdownIt) => void)

    for (const fn of this.mdPlugins) {
      try {
        fn(md)
      } catch (e) {
        console.error('[pipeline] markdown-it 插件执行失败', e)
      }
    }

    const self = this

    const renderRules: Record<string, MdRule> = {
      // 标题：注入 id（渲染阶段从 env 取）
      heading_open(tokens, idx, _opts, env, slf) {
        const id = env.ids.get(idx) ?? ''
        const t = tokens[idx]
        if (id) t.attrSet('id', id)
        return slf.renderToken(tokens, idx, md.options)
      },
      // 图片：重写相对 src
      image(tokens, idx, opts, env, slf) {
        const t = tokens[idx]
        const i = t.attrIndex('src')
        if (i >= 0) {
          const attrs = t.attrs ?? []
          attrs[i] = ['src', resolveAsset(attrs[i][1], env.ctx.filePath)]
          t.attrs = attrs
        }
        t.attrJoin('class', 'k-md-img')
        t.attrSet('loading', 'lazy')
        t.attrSet('decoding', 'async')
        return slf.renderToken(tokens, idx, opts)
      },
      // 链接：分类标记
      link_open(tokens, idx, _opts, env, slf) {
        const t = tokens[idx]
        const i = t.attrIndex('href')
        const href = i >= 0 ? (t.attrs ?? [])[i][1] : ''
        if (/^https?:\/\//i.test(href)) {
          t.attrSet('target', '_blank')
          t.attrSet('rel', 'noopener')
          t.attrSet('data-k-ext', '1')
        } else if (/\.(md|markdown|mdx)([?#]|$)/i.test(href)) {
          t.attrSet('data-k-md', resolveAsset(href, env.ctx.filePath).replace(/^\/kfs\?path=/, ''))
          t.attrSet('title', '在 KairosMd 中打开')
        }
        return slf.renderToken(tokens, idx, md.options)
      },
      // 代码块：插件钩子优先，其次 Shiki；带源码行标记供滚动同步
      fence(tokens, idx, _opts, env) {
        const t = tokens[idx]
        const info = (t.info || '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
        const ctx = env.ctx
        let out: string | undefined
        for (const h of self.hooks) {
          if (h.fence) {
            out = h.fence(t.content, info, ctx)
            if (out !== undefined) break
          }
        }
        if (out === undefined) out = highlightCode(t.content, info, themeEngine.current.dark)
        if (t.map && out.startsWith('<pre')) {
          out = out.replace('<pre', `<pre data-line="${t.map[0] + 1}"`)
        }
        return out
      },
    }
    Object.assign(md.renderer.rules, renderRules)

    return md
  }

  registerMdPlugin(fn: MdPluginFn) {
    this.mdPlugins.push(fn)
    this.md = this.build()
    bus.emit('markdown:refresh', undefined)
  }

  registerHook(hook: RenderHook) {
    this.hooks.push(hook)
  }

  clearExtensions() {
    this.mdPlugins = []
    this.hooks = []
    this.md = this.build()
  }

  render(src: string, ctx: RenderCtx): RenderResult {
    const env: RenderEnv = { ids: new Map(), toc: [], used: new Map(), ctx }
    const tokens = this.md.parse(src, env)

    // 预扫描：源码行标记（滚动同步用）+ 标题锚点 + TOC
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.map && t.nesting !== -1 && t.type !== 'inline') {
        t.attrSet('data-line', String(t.map[0] + 1))
      }
      if (t.type === 'heading_open' && /^h[1-4]$/.test(t.tag)) {
        const text = inlineText(tokens.slice(i + 1, i + 3))
        const id = slugify(text, env.used)
        env.ids.set(i, id)
        env.toc.push({ id, text, level: Number(t.tag.slice(1)), line: t.map ? t.map[0] + 1 : 0 })
      }
    }

    let html = this.md.renderer.render(tokens, this.md.options, env)
    html = transformTaskHtml(html)
    for (const h of this.hooks) {
      if (h.afterRender) {
        try {
          html = h.afterRender(html, ctx)
        } catch (e) {
          console.error(`[pipeline] 钩子 ${h.id} afterRender 失败`, e)
        }
      }
    }
    // 最后统一净化：插件产物同样受检（S1 XSS 防线）
    html = sanitizeHtml(html)
    return { html, toc: env.toc }
  }
}

/**
 * 任务列表勾选框：HTML 后处理。
 * markdown-it 把 [ ] / [x] 渲染为 <li>[ ] 文本</li>，这里把开头的方括号替换为可点击的 .k-task 元素。
 * 刻意只匹配 <li> 内紧随开标签的方括号，避免误伤正文中的 [ ]。
 */
const TASK_RE = /(<li>)(\s*)\[([ xX])\]\s+/g
function transformTaskHtml(html: string): string {
  return html.replace(TASK_RE, (_m, li: string, gap: string, mark: string) => {
    const on = mark.toLowerCase() === 'x'
    return `${li}${gap}<span class="k-task${on ? ' on' : ''}" role="checkbox"></span>`
  })
}

export const pipeline = new Pipeline()
export { escapeHtml }
