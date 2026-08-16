/**
 * Shiki 代码高亮：按需创建 highlighter，只打包用到的语言与主题。
 * 未就绪时降级为纯文本，就绪后通过总线通知阅读器重渲染。
 */
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langBash from 'shiki/langs/bash.mjs'
import langC from 'shiki/langs/c.mjs'
import langCpp from 'shiki/langs/cpp.mjs'
import langCss from 'shiki/langs/css.mjs'
import langDiff from 'shiki/langs/diff.mjs'
import langDockerfile from 'shiki/langs/dockerfile.mjs'
import langGo from 'shiki/langs/go.mjs'
import langHtml from 'shiki/langs/html.mjs'
import langJava from 'shiki/langs/java.mjs'
import langJavascript from 'shiki/langs/javascript.mjs'
import langJson from 'shiki/langs/json.mjs'
import langLua from 'shiki/langs/lua.mjs'
import langMarkdown from 'shiki/langs/markdown.mjs'
import langPowershell from 'shiki/langs/powershell.mjs'
import langPython from 'shiki/langs/python.mjs'
import langRust from 'shiki/langs/rust.mjs'
import langSql from 'shiki/langs/sql.mjs'
import langToml from 'shiki/langs/toml.mjs'
import langTsx from 'shiki/langs/tsx.mjs'
import langTypescript from 'shiki/langs/typescript.mjs'
import langVue from 'shiki/langs/vue.mjs'
import langXml from 'shiki/langs/xml.mjs'
import langYaml from 'shiki/langs/yaml.mjs'
import themeDawn from 'shiki/themes/rose-pine-dawn.mjs'
import themeMoon from 'shiki/themes/rose-pine-moon.mjs'
import { bus } from '../events'

const bundledLangs = {
  bash: langBash,
  c: langC,
  cpp: langCpp,
  css: langCss,
  diff: langDiff,
  dockerfile: langDockerfile,
  go: langGo,
  html: langHtml,
  java: langJava,
  javascript: langJavascript,
  js: langJavascript,
  json: langJson,
  lua: langLua,
  markdown: langMarkdown,
  md: langMarkdown,
  powershell: langPowershell,
  python: langPython,
  py: langPython,
  rust: langRust,
  sql: langSql,
  toml: langToml,
  tsx: langTsx,
  typescript: langTypescript,
  ts: langTypescript,
  vue: langVue,
  xml: langXml,
  yaml: langYaml,
} as const

const bundledThemes = { 'rose-pine-dawn': themeDawn, 'rose-pine-moon': themeMoon } as const

let highlighter: HighlighterCore | null = null

export function initHighlighter(): Promise<void> {
  // JS 正则引擎：免 WASM，体积最小，高亮精度对阅读场景足够
  return createHighlighterCore({
    themes: Object.values(bundledThemes),
    langs: Object.values(bundledLangs),
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
    .then((h) => {
      highlighter = h
      bus.emit('shiki:ready', undefined)
    })
    .catch((e: unknown) => console.warn('[shiki] 初始化失败，代码块将退化为纯文本', e))
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 高亮一段代码；highlighter 未就绪或语言缺失时返回纯文本 <pre>，并尝试异步补载语言 */
export function highlightCode(code: string, lang: string, dark: boolean): string {
  if (highlighter) {
    const alias = lang.toLowerCase()
    const name = alias in bundledLangs ? alias : normalizeAlias(alias)
    try {
      return highlighter.codeToHtml(code, {
        lang: name,
        theme: dark ? 'rose-pine-moon' : 'rose-pine-dawn',
      })
    } catch {
      // 语言未加载：动态导入语言模块并补载，完成后通知重渲染
      import(`shiki/langs/${name}.mjs`)
        .then((m: { default: unknown }) => highlighter!.loadLanguage(m.default as never))
        .then(() => bus.emit('lang:loaded', name))
        .catch(() => {})
    }
  }
  return `<pre class="k-code-plain"><code>${escapeHtml(code)}</code></pre>`
}

function normalizeAlias(alias: string): string {
  const map: Record<string, string> = {
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    'c++': 'cpp',
    py: 'python',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    htm: 'html',
    yml: 'yaml',
    md: 'markdown',
    docker: 'dockerfile',
    ps1: 'powershell',
    golang: 'go',
    rs: 'rust',
  }
  return map[alias] ?? alias
}
