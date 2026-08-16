/** 启动序列：挂载 → 加载配置 → 应用主题 → 注册命令 → 初始化插件 → 恢复上次文件 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import 'katex/dist/katex.min.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/jetbrains-mono/800.css'
import { useSettingsStore } from './stores/settings'
import { useLibraryStore } from './stores/library'
import { installGlobalHotkeys } from './core/commands/registry'
import { registerBuiltinCommands } from './core/commands/builtin'
import { pluginRuntime } from './core/plugins/runtime'
import { themeEngine } from './core/themes/engine'
import { initHighlighter } from './core/markdown/shiki'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { InitialFile, MarkFrontendReady } from '../wailsjs/go/main/Files'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

let booted = false
let pendingOpenPaths: string[] = []

function enqueueOpenPath(path: unknown) {
  if (typeof path !== 'string' || !path) return
  if (!booted) {
    pendingOpenPaths.push(path)
    return
  }
  void useLibraryStore().openFile(path)
}

// 第二次从资源管理器打开 Markdown 时，Wails 会把路径转发到当前实例。
EventsOn('app:open-file', (path: unknown) => enqueueOpenPath(path))

// 窗口关闭（X / Alt+F4）被 OnBeforeClose 拦截后转发到这里：先落盘草稿再决定是否弹确认
EventsOn('app:confirm-close', () => {
  useLibraryStore().saveDraftNow()
  useLibraryStore().requestQuit()
})

async function boot() {
  const settings = useSettingsStore()
  const lib = useLibraryStore()

  await settings.load()
  await themeEngine.refreshUserThemes()
  themeEngine.apply(settings.themeId, { silent: true })

  registerBuiltinCommands()
  installGlobalHotkeys()

  // 插件系统保留，但无内置示例插件；仅扫描用户目录下的外部插件
  await pluginRuntime.refreshExternals()
  await pluginRuntime.rebuild()

  void initHighlighter()

  const initialPath = await InitialFile()
  await lib.boot(initialPath)

  const queued = await MarkFrontendReady()
  booted = true
  const allQueued = [...pendingOpenPaths, ...(queued ?? [])]
  pendingOpenPaths = []
  for (const path of allQueued) {
    await lib.openFile(path)
  }
}

void boot().catch((e) => console.error('[boot] 启动失败', e))
