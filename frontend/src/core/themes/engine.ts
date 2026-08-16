import type { ThemeDef } from '../types'
import { bus } from '../events'
import { builtinThemes, DEFAULT_THEME_ID } from './defs'
import { ListUserThemes } from '../../../wailsjs/go/main/Files'

const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

/** 用户主题 theme.json 的宽松结构 → ThemeDef（字段不全时用内置默认值补齐） */
function normalizeUserTheme(raw: Record<string, unknown>): ThemeDef | null {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const name = typeof raw.name === 'string' ? raw.name : id
  if (!id || !name) return null
  const colors = (raw.colors && typeof raw.colors === 'object' ? raw.colors : raw) as Record<string, unknown>
  const pick = (k: string, fallback: string): string =>
    typeof colors[k] === 'string' ? (colors[k] as string) : fallback
  const sakura = builtinThemes[0]
  return {
    id: `user:${id}`,
    name,
    description: typeof raw.description === 'string' ? raw.description : '用户主题',
    dark: raw.dark === true,
    colors: {
      bg: pick('bg', sakura.colors.bg),
      surface: pick('surface', sakura.colors.surface),
      surface2: pick('surface2', sakura.colors.surface2),
      border: pick('border', sakura.colors.border),
      text: pick('text', sakura.colors.text),
      textSoft: pick('textSoft', sakura.colors.textSoft),
      textFaint: pick('textFaint', sakura.colors.textFaint),
      accent: pick('accent', sakura.colors.accent),
      accent2: pick('accent2', sakura.colors.accent2),
      accentContrast: pick('accentContrast', sakura.colors.accentContrast),
      link: pick('link', sakura.colors.link),
      codeBg: pick('codeBg', sakura.colors.codeBg),
      codeText: pick('codeText', sakura.colors.codeText),
    },
    bgLayers: typeof raw.bgLayers === 'string' ? raw.bgLayers : '',
    bgImage: typeof raw.bgImage === 'string' ? raw.bgImage : undefined,
    radius: typeof raw.radius === 'number' ? raw.radius : 14,
    css: typeof raw.css === 'string' ? raw.css : undefined,
    builtin: false,
  }
}

class ThemeEngine {
  private themes = new Map<string, ThemeDef>()
  private currentId = DEFAULT_THEME_ID
  private dir = '' // 当前用户主题所在目录，用于解析 bgImage

  get current(): ThemeDef {
    return this.themes.get(this.currentId) ?? this.themes.get(DEFAULT_THEME_ID)!
  }

  list(): ThemeDef[] {
    return [...this.themes.values()]
  }

  constructor() {
    for (const t of builtinThemes) this.themes.set(t.id, t)
    this.apply(DEFAULT_THEME_ID, { silent: true })
  }

  /** 从磁盘重新扫描用户主题（themes/<id>/theme.json） */
  async refreshUserThemes() {
    try {
      const list = await ListUserThemes()
      for (const key of [...this.themes.keys()]) {
        if (key.startsWith('user:')) this.themes.delete(key)
      }
      for (const raw of list ?? []) {
        const def = normalizeUserTheme(raw)
        if (def) {
          this.themes.set(def.id, def)
          ;(def as ThemeDef & { _dir?: string })._dir = typeof raw._dir === 'string' ? raw._dir : ''
        }
      }
    } catch (e) {
      console.warn('[themes] 用户主题加载失败', e)
    }
  }

  apply(id: string, opts: { silent?: boolean } = {}) {
    const def = this.themes.get(id) ?? this.themes.get(DEFAULT_THEME_ID)!
    this.currentId = def.id
    const root = document.documentElement
    for (const [k, v] of Object.entries(def.colors)) {
      root.style.setProperty(`--k-${camelToKebab(k)}`, v)
    }
    root.style.setProperty('--k-radius', `${def.radius}px`)
    root.style.setProperty('--k-radius-sm', `${Math.max(6, def.radius - 6)}px`)
    const bgImg = (def as ThemeDef & { _dir?: string })._dir && def.bgImage
      ? `url(/kfs?path=${encodeURIComponent((def as ThemeDef & { _dir?: string })._dir + '/' + def.bgImage)})`
      : ''
    root.style.setProperty('--k-bg-image', [bgImg, def.bgLayers].filter(Boolean).join(','))
    root.classList.toggle('k-dark', def.dark)
    const styleEl = document.getElementById('k-theme-css') as HTMLStyleElement | null
    if (def.css) {
      if (!styleEl) {
        const el = document.createElement('style')
        el.id = 'k-theme-css'
        document.head.appendChild(el)
        el.textContent = def.css
      } else {
        styleEl.textContent = def.css
      }
    } else if (styleEl) {
      styleEl.textContent = ''
    }
    if (!opts.silent) bus.emit('theme:changed', { id: def.id, dark: def.dark })
  }
}

export const themeEngine = new ThemeEngine()
