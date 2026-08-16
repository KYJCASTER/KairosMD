/** 内置命令：快捷键与命令面板的默认入口 */
import { registerCommand } from './registry'
import { themeEngine } from '../themes/engine'
import { useSettingsStore } from '../../stores/settings'
import { useLibraryStore } from '../../stores/library'
import { useUiStore } from '../../stores/ui'

export function registerBuiltinCommands() {
  const settings = useSettingsStore()
  const lib = useLibraryStore()
  const ui = useUiStore()

  const cycleTheme = (dir: 1 | -1 = 1) => {
    const list = themeEngine.list()
    const i = list.findIndex((t) => t.id === settings.themeId)
    const next = list[(i + dir + list.length) % list.length]
    settings.setTheme(next.id)
    ui.toast(`主题 · ${next.name}`, 'default')
  }

  registerCommand({
    id: 'app:open-file',
    title: '打开文件…',
    group: '应用',
    hotkeys: ['mod+o'],
    run: () => void lib.pickAndOpenFile(),
  })
  registerCommand({
    id: 'app:new',
    title: '新建空白文档',
    group: '应用',
    hotkeys: ['mod+n'],
    run: () => lib.newFile(),
  })
  registerCommand({ id: 'app:home', title: '关闭文档，回到首页', group: '应用', hotkeys: ['alt+arrowleft'], run: () => lib.closeFile() })
  registerCommand({ id: 'app:settings', title: '设置', group: '应用', hotkeys: ['mod+,'], run: () => ui.openView('settings') })
  registerCommand({ id: 'app:plugins', title: '插件管理', group: '应用', run: () => ui.openView('plugins') })

  registerCommand({
    id: 'app:save',
    title: '保存',
    group: '编辑',
    hotkeys: ['mod+s'],
    run: () => void lib.saveFile(),
  })
  registerCommand({
    id: 'app:save-as',
    title: '另存为…',
    group: '编辑',
    hotkeys: ['mod+shift+s'],
    run: () => void lib.saveFileAs(),
  })
  registerCommand({
    id: 'app:export-html',
    title: '导出为 HTML（自包含单文件）',
    group: '编辑',
    run: () => void lib.exportHtmlFile(),
  })
  registerCommand({
    id: 'app:toggle-mode',
    title: '切换模式（编辑 / 对比 / 预览）',
    group: '编辑',
    hotkeys: ['mod+e'],
    run: () => lib.cycleMode(),
  })
  registerCommand({ id: 'app:mode-edit', title: '编辑模式（仅编辑器）', group: '编辑', run: () => lib.setMode('edit') })
  registerCommand({ id: 'app:mode-split', title: '对比模式（编辑 + 预览）', group: '编辑', run: () => lib.setMode('split') })
  registerCommand({ id: 'app:mode-read', title: '预览模式（仅预览）', group: '编辑', run: () => lib.setMode('read') })
  registerCommand({
    id: 'app:toggle-scroll-sync',
    title: '切换编辑 / 预览滚动同步',
    group: '编辑',
    run: () => {
      settings.scrollSync = !settings.scrollSync
      settings.schedulePersist()
      ui.toast(settings.scrollSync ? '滚动同步已开启' : '滚动同步已关闭', 'default')
    },
  })

  registerCommand({
    id: 'view:palette',
    title: '命令面板',
    group: '视图',
    hotkeys: ['mod+k', 'mod+shift+p'],
    run: () => ui.togglePalette(true),
  })
  registerCommand({
    id: 'view:immersive',
    title: '沉浸阅读模式',
    group: '视图',
    hotkeys: ['f11', 'mod+i'],
    run: () => {
      if (!lib.hasContent && !ui.immersive) {
        ui.toast('先打开一篇文档再进入沉浸模式吧 (´･ω･`)', 'default')
        return
      }
      ui.toggleImmersive()
    },
  })
  registerCommand({
    id: 'theme:cycle',
    title: '切换主题（下一个）',
    group: '主题',
    hotkeys: ['alt+t'],
    run: () => cycleTheme(1),
  })
  registerCommand({
    id: 'theme:effects',
    title: '切换主题特效（花瓣 / 星空 / 红叶 / 墨尘）',
    group: '主题',
    run: () => {
      settings.setEffects(!settings.effectsOn)
      ui.toast(settings.effectsOn ? '主题特效已开启' : '主题特效已关闭', 'default')
    },
  })

  for (const t of themeEngine.list()) {
    const id = `theme:${t.id}`
    const title = `主题 · ${t.name}`
    registerCommand({ id, title, group: '主题', run: () => settings.setTheme(t.id) })
  }

  registerCommand({
    id: 'reader:reload',
    title: '重新加载当前文档',
    group: '阅读',
    hotkeys: ['mod+r'],
    run: () => {
      if (lib.currentPath) void lib.openFile(lib.currentPath, { keepScroll: true })
    },
  })
  const adjustFont = (delta: number) => {
    const v = Math.min(24, Math.max(13, Math.round((settings.fontSize + delta) * 2) / 2))
    settings.patchTypography({ fontSize: v })
  }
  registerCommand({ id: 'reader:font-inc', title: '增大字号', group: '阅读', hotkeys: ['mod+='], run: () => adjustFont(0.5) })
  registerCommand({ id: 'reader:font-dec', title: '减小字号', group: '阅读', hotkeys: ['mod+-'], run: () => adjustFont(-0.5) })
}
