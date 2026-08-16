/** 设置仓库：持久化到 Go 侧 config.json，主题/排版的唯一数据源 */
import { defineStore } from 'pinia'
import type { PersistedSettings } from '../core/types'
import { themeEngine } from '../core/themes/engine'
import { DEFAULT_THEME_ID } from '../core/themes/defs'
import { ReadConfig, SaveConfig } from '../../wailsjs/go/main/Files'

const FONT_STACKS: Record<string, string> = {
  auto: `'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif`,
  round: `'Nunito', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif`,
  serif: `Georgia, 'Source Han Serif SC', 'Noto Serif CJK SC', 'SimSun', serif`,
  mono: `'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace`,
}

const defaults = (): PersistedSettings => ({
  themeId: DEFAULT_THEME_ID,
  fontSize: 16.5,
  lineHeight: 1.85,
  pageWidth: 780,
  fontFamily: 'auto',
  splitRatio: 0.5,
  scrollSync: true,
  editorMono: true,
  effectsOn: true,
  recent: [],
  lastFile: '',
  positions: {},
  pluginsEnabled: {},
  pluginSettings: {},
})

export const useSettingsStore = defineStore('settings', {
  state: () => defaults(),

  getters: {
    fontStack: (s) => FONT_STACKS[s.fontFamily] ?? FONT_STACKS.auto,
  },

  actions: {
    async load() {
      try {
        const cfg = await ReadConfig()
        if (cfg && typeof cfg === 'object') {
          const c = cfg as Record<string, unknown>
          if (typeof c.themeId === 'string') this.themeId = c.themeId
          if (typeof c.fontSize === 'number') this.fontSize = c.fontSize
          if (typeof c.lineHeight === 'number') this.lineHeight = c.lineHeight
          if (typeof c.pageWidth === 'number') this.pageWidth = c.pageWidth
          if (typeof c.fontFamily === 'string') this.fontFamily = c.fontFamily
          if (typeof c.splitRatio === 'number') this.splitRatio = Math.min(0.8, Math.max(0.2, c.splitRatio))
          if (typeof c.scrollSync === 'boolean') this.scrollSync = c.scrollSync
          if (typeof c.editorMono === 'boolean') this.editorMono = c.editorMono
          if (typeof c.effectsOn === 'boolean') this.effectsOn = c.effectsOn
          if (Array.isArray(c.recent)) this.recent = c.recent as PersistedSettings['recent']
          if (typeof c.lastFile === 'string') this.lastFile = c.lastFile
          if (c.positions && typeof c.positions === 'object') this.positions = c.positions as PersistedSettings['positions']
          if (c.pluginsEnabled && typeof c.pluginsEnabled === 'object') this.pluginsEnabled = c.pluginsEnabled as PersistedSettings['pluginsEnabled']
          if (c.pluginSettings && typeof c.pluginSettings === 'object') this.pluginSettings = c.pluginSettings as PersistedSettings['pluginSettings']
        }
      } catch (e) {
        console.warn('[settings] 配置读取失败，使用默认值', e)
      }
      themeEngine.apply(this.themeId, { silent: true })
      this.applyTypography()
    },

    setTheme(id: string) {
      this.themeId = id
      themeEngine.apply(id)
      this.applyTypography()
      this.persist()
    },

    applyTypography() {
      const root = document.documentElement
      root.style.setProperty('--k-fs', `${this.fontSize}px`)
      root.style.setProperty('--k-lh', String(this.lineHeight))
      root.style.setProperty('--k-pw', `${this.pageWidth}px`)
      root.style.setProperty('--k-ff', this.fontStack)
      root.style.setProperty('--k-editor-ff', this.editorMono ? FONT_STACKS.mono : this.fontStack)
    },

    setEditorMono(v: boolean) {
      this.editorMono = v
      this.applyTypography()
      this.schedulePersist()
    },

    setEffects(v: boolean) {
      this.effectsOn = v
      this.schedulePersist()
    },

    /** 排版参数拖动时高频调用，立即生效、防抖落盘 */
    patchTypography(patch: Partial<Pick<PersistedSettings, 'fontSize' | 'lineHeight' | 'pageWidth' | 'fontFamily'>>) {
      this.$patch(patch)
      this.applyTypography()
      this.schedulePersist()
    },

    savePosition(path: string, r: number) {
      if (!path) return
      this.positions = { ...this.positions, [path]: { r, t: Date.now() } }
      const keys = Object.keys(this.positions)
      if (keys.length > 200) {
        keys.sort((a, b) => this.positions[a].t - this.positions[b].t)
        for (const k of keys.slice(0, keys.length - 200)) delete this.positions[k]
      }
      this.schedulePersist(1500)
    },

    getPosition(path: string): number | null {
      const p = this.positions[path]
      if (!p) return null
      if (Date.now() - p.t > 30 * 24 * 3600 * 1000) return null
      return p.r
    },

    _persistTimer: undefined as ReturnType<typeof setTimeout> | undefined,

    schedulePersist(delay = 400) {
      clearTimeout(this._persistTimer)
      this._persistTimer = setTimeout(() => void this.persist(), delay)
    },

    async persist() {
      try {
        const data: Record<string, unknown> = { ...this.$state }
        delete (data as Record<string, unknown>)._persistTimer
        await SaveConfig(data)
      } catch (e) {
        console.warn('[settings] 保存失败', e)
      }
    },
  },
})
