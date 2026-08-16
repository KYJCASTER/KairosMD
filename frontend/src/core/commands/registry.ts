/** 命令注册表：内置命令与插件命令统一入口，支撑命令面板与全局快捷键 */

export interface KCommand {
  id: string
  title: string
  group: string
  /** 如 'mod+k' / 'f11' / 'mod+shift+o' / 'alt+arrowleft' */
  hotkeys?: string[]
  run: () => void | Promise<void>
}

const commands = new Map<string, KCommand>()
const hotkeyMap = new Map<string, string>()

function normalize(hotkey: string): string {
  return hotkey
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => {
      const order = ['mod', 'ctrl', 'shift', 'alt']
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      if (ai >= 0 || bi >= 0) return ai - bi
      return a.localeCompare(b)
    })
    .join('+')
}

export function registerCommand(cmd: KCommand) {
  commands.set(cmd.id, cmd)
  if (cmd.hotkeys) {
    for (const hk of cmd.hotkeys) hotkeyMap.set(normalize(hk), cmd.id)
  }
}

export function runCommand(id: string) {
  const c = commands.get(id)
  if (!c) return
  try {
    void c.run()
  } catch (e) {
    console.error(`[commands] "${id}" 执行失败`, e)
  }
}

export function listCommands(): KCommand[] {
  return [...commands.values()].sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title))
}

/** 卸载某插件注册的全部命令（id 前缀 `<pluginId>:`） */
export function unregisterPluginCommands(pluginId: string) {
  const prefix = `${pluginId}:`
  for (const [id, c] of commands) {
    if (id.startsWith(prefix)) {
      commands.delete(id)
      if (c.hotkeys) for (const hk of c.hotkeys) hotkeyMap.delete(normalize(hk))
    }
  }
}

function eventToHotkey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const k = e.key.toLowerCase()
  parts.push(k === ' ' ? 'space' : k)
  return normalize(parts.join('+'))
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
  )
}

/** 全局快捷键监听（输入框中仅响应带 mod 的组合键） */
export function installGlobalHotkeys() {
  window.addEventListener('keydown', (e) => {
    const hotkey = eventToHotkey(e)
    const id = hotkeyMap.get(hotkey)
    if (!id) return
    if (isEditable(e.target) && !(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    e.stopPropagation()
    runCommand(id)
  })
}
