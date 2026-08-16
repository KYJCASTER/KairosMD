/**
 * 插件运行时：加载内置与外部插件，注入 kairos API。
 * 启停某插件 = 清空全部扩展注册 → 重新初始化所有已启用插件（简单且无状态残留）。
 */
import type { PluginManifest, ThemeDef } from '../types'
import { bus } from '../events'
import { pipeline } from '../markdown/pipeline'
import { registerCommand, unregisterPluginCommands } from '../commands/registry'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { themeEngine } from '../themes/engine'
import { ListExternalPlugins, ReadPluginCode } from '../../../wailsjs/go/main/Files'

export const APP_VERSION = '0.1.0'

export interface KairosApi {
  version: string
  manifest: PluginManifest
  registerCommand(cmd: { id: string; title: string; group?: string; hotkeys?: string[]; run: () => void }): void
  registerMarkdownPlugin(fn: (md: unknown) => void): void
  registerRenderHook(hook: {
    id: string
    fence?: (code: string, lang: string, ctx: { filePath: string }) => string | undefined
    afterRender?: (html: string, ctx: { filePath: string }) => string
  }): void
  on<K extends 'reader:file-open' | 'reader:rendered' | 'settings:changed' | 'theme:changed'>(
    event: K,
    cb: (payload: never) => void,
  ): void
  settings: {
    get<T>(key: string, fallback: T): T
    set(key: string, value: unknown): void
  }
  ui: {
    toast(text: string, type?: 'default' | 'success' | 'error'): void
    setStatus(text: string): void
    addCss(css: string): void
  }
  files: {
    readCurrent(): { path: string; content: string }
    open(path: string): Promise<void>
  }
  themes: {
    list(): ThemeDef[]
    currentId(): string
  }
}

export interface PluginDef {
  manifest: PluginManifest
  /** 返回的清理函数会在插件停用/重建时调用 */
  activate: (api: KairosApi) => void | Promise<void | (() => void)>
  builtin?: boolean
}

/** 已注册插件的信息（用于插件管理页展示） */
export interface InstalledPlugin {
  manifest: PluginManifest
  builtin: boolean
  enabled: boolean
  error?: string
}

class PluginRuntime {
  private builtins: PluginDef[] = []
  private externals: PluginDef[] = []
  private installed: InstalledPlugin[] = []
  private onOffStack: Array<() => void> = []
  private cleanups: Array<() => void> = []

  registerBuiltins(defs: PluginDef[]) {
    this.builtins = defs
  }

  async refreshExternals() {
    this.externals = []
    try {
      const list = await ListExternalPlugins()
      for (const ep of list ?? []) {
        const m = ep.manifest as Record<string, unknown>
        const id = typeof m.id === 'string' ? m.id : ep.id
        if (!id || !ep.hasMain || id.includes(':')) continue
        const manifest: PluginManifest = {
          id,
          name: typeof m.name === 'string' ? m.name : id,
          version: typeof m.version === 'string' ? m.version : '?',
          author: typeof m.author === 'string' ? m.author : undefined,
          description: typeof m.description === 'string' ? m.description : undefined,
        }
        this.externals.push({
          manifest,
          builtin: false,
          activate: (api) => externalActivate(id, manifest, api),
        })
      }
    } catch (e) {
      console.warn('[plugins] 外部插件扫描失败', e)
    }
  }

  listInstalled(): InstalledPlugin[] {
    return this.installed
  }

  /** 全量重建：按 settings.pluginsEnabled 初始化所有应启用的插件 */
  async rebuild() {
    // 清理旧注册
    for (const cleanup of this.cleanups) {
      try {
        cleanup()
      } catch { /* 忽略清理错误 */ }
    }
    this.cleanups = []
    for (const off of this.onOffStack) off()
    this.onOffStack = []
    for (const p of [...this.builtins, ...this.externals]) unregisterPluginCommands(p.manifest.id)
    removePluginStyles()
    pipeline.clearExtensions()

    const settings = useSettingsStore()
    this.installed = []
    const enabledMap = settings.pluginsEnabled ?? {}

    for (const def of [...this.builtins, ...this.externals]) {
      const enabled = def.builtin ? enabledMap[def.manifest.id] !== false : enabledMap[def.manifest.id] === true
      const entry: InstalledPlugin = { manifest: def.manifest, builtin: def.builtin ?? false, enabled }
      this.installed.push(entry)
      if (!enabled) continue
      try {
        const cleanup = await def.activate(this.createApi(def.manifest))
        if (typeof cleanup === 'function') this.cleanups.push(cleanup)
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e)
        console.error(`[plugins] "${def.manifest.id}" 初始化失败`, e)
      }
    }

    bus.emit('markdown:refresh', undefined)
  }

  async setEnabled(id: string, on: boolean) {
    const settings = useSettingsStore()
    settings.pluginsEnabled = { ...settings.pluginsEnabled, [id]: on }
    settings.persist()
    await this.rebuild()
  }

  async rescan() {
    await this.refreshExternals()
    await this.rebuild()
  }

  private createApi(manifest: PluginManifest): KairosApi {
    const settings = () => useSettingsStore()
    const ui = () => useUiStore()
    const lib = () => useLibraryStore()

    const api: KairosApi = {
      version: APP_VERSION,
      manifest,
      registerCommand(cmd) {
        registerCommand({
          id: cmd.id.includes(':') ? cmd.id : `${manifest.id}:${cmd.id}`,
          title: cmd.title,
          group: cmd.group ?? `插件 · ${manifest.name}`,
          hotkeys: cmd.hotkeys,
          run: cmd.run,
        })
      },
      registerMarkdownPlugin(fn) {
        pipeline.registerMdPlugin(fn as never)
      },
      registerRenderHook(hook) {
        pipeline.registerHook({ id: `${manifest.id}:${hook.id}`, fence: hook.fence as never, afterRender: hook.afterRender as never })
      },
      on(event, cb) {
        const off = bus.on(event, cb as never)
        pluginRuntime.onOffStack.push(off)
      },
      settings: {
        get<T>(key: string, fallback: T): T {
          const bag = settings().pluginSettings[manifest.id]
          const v = bag ? bag[key] : undefined
          return (v === undefined ? fallback : v) as T
        },
        set(key: string, value: unknown) {
          const s = settings()
          const bag = { ...(s.pluginSettings[manifest.id] ?? {}), [key]: value }
          s.pluginSettings = { ...s.pluginSettings, [manifest.id]: bag }
          s.persist()
          bus.emit('settings:changed', { plugin: manifest.id, key, value })
        },
      },
      ui: {
        toast(text, type) {
          ui().toast(text, type ?? 'default')
        },
        setStatus(text) {
          ui().statusText = text
        },
        addCss(css) {
          addPluginStyle(manifest.id, css)
        },
      },
      files: {
        readCurrent() {
          return { path: lib().currentPath, content: lib().content }
        },
        async open(path) {
          await lib().openFile(path)
        },
      },
      themes: {
        list() {
          return themeEngine.list()
        },
        currentId() {
          return settings().themeId
        },
      },
    }
    return api
  }
}

// ---- 插件样式管理 ----

function addPluginStyle(pluginId: string, css: string) {
  let el = document.getElementById(`k-plugin-css-${pluginId}`)
  if (!el) {
    el = document.createElement('style')
    el.id = `k-plugin-css-${pluginId}`
    document.head.appendChild(el)
  }
  el.textContent = css
}

function removePluginStyles() {
  for (const el of document.querySelectorAll('style[id^="k-plugin-css-"]')) el.remove()
}

async function externalActivate(id: string, manifest: PluginManifest, api: KairosApi) {
  const code = await ReadPluginCode(id)
  // 外部插件以普通脚本形式执行，kairos 作为唯一入口注入
  const fn = new Function('kairos', `"use strict"\n${code}`)
  fn(api)
  void manifest
}

export const pluginRuntime = new PluginRuntime()
