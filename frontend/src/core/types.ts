/** 全局共享类型定义（极简版：无侧边栏、无 TOC、无特效） */

export interface RecentFile {
  path: string
  name: string
  t: number
}

export interface TocItem {
  id: string
  text: string
  level: number
  /** 对应源码行（滚动同步与跳转用） */
  line: number
}

export interface ThemeDef {
  id: string
  name: string
  description: string
  dark: boolean
  /** 颜色键 -> CSS 变量（accentContrast -> --k-accent-contrast） */
  colors: Record<string, string>
  /** 背景 CSS background-image 值（多层渐变） */
  bgLayers: string
  /** 主题目录内的背景图文件名（仅用户主题），通过 /kfs 提供 */
  bgImage?: string
  radius: number
  css?: string
  builtin: boolean
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  minApp?: string
}

export interface PersistedSettings {
  themeId: string
  fontSize: number
  lineHeight: number
  pageWidth: number
  fontFamily: string
  /** 对比模式下编辑区占比（0.2 ~ 0.8） */
  splitRatio: number
  /** 对比模式下编辑/预览滚动同步 */
  scrollSync: boolean
  /** 编辑器使用等宽字体（预览仍跟随主题字体） */
  editorMono: boolean
  /** 主题特效（花瓣 / 星空 / 红叶 / 墨尘） */
  effectsOn: boolean
  recent: RecentFile[]
  lastFile: string
  positions: Record<string, { r: number; t: number }>
  pluginsEnabled: Record<string, boolean>
  pluginSettings: Record<string, Record<string, unknown>>
}
