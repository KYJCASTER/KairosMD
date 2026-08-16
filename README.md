# KairosMd · 极简 Markdown 阅读器

一款用 Go + Wails + Vue 3 打造的桌面 Markdown 阅读器：打开即读，界面极简，主题与插件高度可扩展。

## ✨ 特性

- **极简阅读**：打开即读，沉浸模式（F11），阅读位置记忆
- **高扩展**：主题包 + 插件系统（Obsidian 式简化 API），命令面板统一入口
- **主题系统**：樱 / 宙 / 枫 / 墨 四款内置主题，热切换不重载；每个主题配套氛围特效（花瓣 / 星空 / 红叶 / 墨尘），可随时关闭
- **排版自由**：字号 / 行距 / 页宽 / 字体实时调节
- **代码高亮**：Shiki，内置常用语言，未加载语言自动按需补载
- **数学公式**：KaTeX
- **轻量**：安装包约 9 MB

## 🚀 快速开始

### 环境要求

- Go 1.21+
- Node.js 18+
- Wails CLI v3（`go install github.com/wailsapp/wails/v3/cmd/wails3@latest`）
- Task（构建任务运行器，`go install github.com/go-task/task/v3/cmd/task@latest`）
- Windows 需要 WebView2 运行时（Win10/11 通常已预装）

### 开发

```bash
wails3 dev              # 热重载开发
wails3 build            # 生成可执行文件到 bin/
wails3 package          # 生成 NSIS 安装包（含 .md 文件关联注册）
wails3 generate bindings  # Go 服务方法变更后重新生成前端绑定
```

### 使用

打开 `bin/KairosMd.exe`，按 `Ctrl+O` 打开一个 Markdown 文件，或直接拖入。`samples/` 目录里有完整的示例文档。

要让 KairosMd 成为 Windows 的 Markdown 默认打开方式，请使用 `wails3 package` 生成并运行安装包。安装器会注册 `.md`、`.markdown` 和 `.mdx` 文件关联；之后在资源管理器中双击这些文件即可直接打开。直接运行 `bin/KairosMd.exe` 不会自动修改系统文件关联。

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+O` | 打开文件 |
| `Ctrl+N` | 新建空白文档 |
| `Ctrl+S` | 保存 / 另存为（未保存文档） |
| `Ctrl+Shift+S` | 另存为… |
| `Ctrl+E` | 切换模式（编辑 / 对比 / 预览） |
| `Ctrl+F` | 查找 / 替换（编辑器内） |
| `Ctrl+B` / `Ctrl+I` | 加粗 / 斜体 |
| `Ctrl+Shift+X` / `Ctrl+Shift+C` | 删除线 / 行内代码 |
| `Ctrl+K` | 命令面板 |
| `Ctrl+,` | 设置 |
| `F11` | 沉浸阅读模式 |
| `Alt+T` | 切换主题 |
| `Ctrl+=` / `Ctrl+-` | 增大 / 减小字号 |
| `Esc` | 退出沉浸 / 关闭面板 |

编辑器顶部有格式工具栏（标题 / 加粗 / 链接 / 表格等），按住分隔条拖动可调节对比模式两侧宽度（双击复位）。编辑时的智能行为：回车自动续写列表与任务列表（空列表项再回车退出）、`**` `` ` `` `~` `$$` 自动配对、粘贴 URL 到选中文本上自动变为链接（图片 URL 变图片语法）。

对比模式下编辑与预览**双向滚动同步**（基于源码行映射）：滚任意一侧另一侧自动跟随；在预览里点击任意段落，编辑器光标直接跳到对应源码行；点击任务列表勾选框会直接回写源码 `[ ]` / `[x]`（保留撤销历史）。打字重渲染时预览按源码行锚定，视口上方内容增删不会引起跳动。命令面板可搜索"滚动同步"随时开关。

有未保存修改时，退出、新建、打开其他文件都会先弹确认，避免误丢内容；切换编辑 / 对比 / 预览模式不会丢失撤销历史与光标位置。未保存内容还会**自动快照草稿**（防抖 3 秒 + 失焦/关闭时立即落盘，存于 `%APPDATA%\KairosMd\drafts\`），崩溃或强杀后再次打开同一文档会提示恢复，30 天前的草稿自动清理。

更多能力：标题栏右侧的**大纲**按钮可弹出文档目录（长文档导航，预览与编辑器一起跳转）；菜单里的**导出 HTML** 生成自包含单文件（主题样式、本地图片、公式字体全部内嵌，离线可看）；编辑器里直接 **Ctrl+V 粘贴截图**会自动存到文档同目录 `assets/` 并插入引用（文档需已保存）；读取旧中文文档时自动识别 GBK/GB18030 编码，保存统一为 UTF-8；设置页可让编辑器单独使用等宽字体。

## 🎨 主题开发

主题包放在用户配置目录的 `themes/<主题id>/theme.json`（Windows: `%APPDATA%\KairosMd\themes\`）。

### theme.json 结构

```json
{
  "id": "my-theme",
  "name": "我的主题",
  "description": "自定义主题示例",
  "dark": false,
  "colors": {
    "bg": "#fafafa",
    "surface": "rgba(255,255,255,0.8)",
    "surface2": "rgba(255,255,255,0.5)",
    "border": "#e4e4e7",
    "text": "#26262b",
    "textSoft": "#5a5a63",
    "textFaint": "#a1a1aa",
    "accent": "#f27ba5",
    "accent2": "#ffb0c9",
    "accentContrast": "#ffffff",
    "link": "#e05c8a",
    "codeBg": "#fdf0f5",
    "codeText": "#a04468"
  },
  "bgLayers": "linear-gradient(160deg, #fff 0%, #f7f7f8 100%)",
  "bgImage": "bg.jpg",
  "radius": 16,
  "css": ""
}
```

| 字段 | 说明 |
|---|---|
| `colors` | 颜色变量，映射为 CSS `--k-*` 变量（如 `accent` → `--k-accent`） |
| `bgLayers` | 背景 CSS `background-image` 值（多层渐变用逗号分隔） |
| `bgImage` | 主题目录内的背景图文件名，通过本地资源服务加载（可选） |
| `radius` | 全局圆角（px） |
| `css` | 附加 CSS，注入到 `<style id="k-theme-css">`（可选） |

字段不全时会用内置「樱」主题的默认值补齐。放好 `theme.json` 后，在设置页点「重新扫描用户主题」即可加载。

## 🔌 插件开发

插件放在用户配置目录的 `plugins/<插件id>/`，包含 `manifest.json` 和 `main.js` 两个文件。

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "插件功能描述"
}
```

### main.js

`main.js` 通过全局 `kairos` 对象与 KairosMd 交互：

```javascript
// 注册命令（出现在命令面板，可绑定快捷键）
kairos.registerCommand({
  id: 'hello',
  title: '打个招呼',
  hotkeys: ['alt+h'],
  run: () => kairos.ui.toast('Hello from my plugin!', 'success')
})

// 注入 Markdown 语法规则（markdown-it 插件）
kairos.registerMarkdownPlugin((md) => {
  // 示例：==高亮== → <mark>
  md.inline.ruler.before('emphasis', 'highlight', (state) => {
    if (state.src.charCodeAt(state.pos) !== 0x3d /* = */) return false
    const end = state.src.indexOf('==', state.pos + 2)
    if (end < 0) return false
    state.push('html_inline', '', 0).content = '<mark>'
    state.push('text', '', 0).content = state.src.slice(state.pos + 2, end)
    state.push('html_inline', '', 0).content = '</mark>'
    state.pos = end + 2
    return true
  })
})

// 拦截代码块（如自定义图表）
kairos.registerRenderHook({
  id: 'my-fence',
  fence(code, lang) {
    if (lang !== 'mylang') return undefined  // 返回 undefined 走默认高亮
    return `<div class="my-block">${code}</div>`
  }
})

// 监听事件
kairos.on('reader:file-open', ({ path, content }) => {
  kairos.ui.setStatus(`已打开 ${path}`)
})

// 插件自有设置（持久化到 config.json）
const fontSize = kairos.settings.get('fontSize', 14)
kairos.settings.set('fontSize', 16)

// 注入 CSS
kairos.ui.addCss('.my-block { color: red; }')
```

### kairos API 一览

| 命名空间 | 方法 | 说明 |
|---|---|---|
| 根 | `version` | 应用版本号 |
| | `manifest` | 当前插件清单 |
| | `registerCommand(cmd)` | 注册命令 |
| | `registerMarkdownPlugin(fn)` | 注入 markdown-it 插件 |
| | `registerRenderHook(hook)` | 注册渲染钩子（fence 拦截 / afterRender） |
| | `on(event, cb)` | 监听事件，返回取消函数 |
| `settings` | `get(key, fallback)` | 读取插件设置 |
| | `set(key, value)` | 写入插件设置（自动持久化） |
| `ui` | `toast(text, type?)` | 显示通知（type: default/success/error） |
| | `setStatus(text)` | 设置标题栏状态文本 |
| | `addCss(css)` | 注入样式 |
| `files` | `readCurrent()` | 获取当前文档 `{ path, content }` |
| | `open(path)` | 打开文件 |
| `themes` | `list()` | 列出所有主题 |
| | `currentId()` | 当前主题 id |

### 事件

| 事件 | 载荷 | 触发时机 |
|---|---|---|
| `reader:file-open` | `{ path, content }` | 文件打开时 |
| `reader:rendered` | `{ path, el }` | 文档渲染完成（el 为 article 元素） |
| `settings:changed` | `Record<string, unknown>` | 设置变化 |
| `theme:changed` | `{ id, dark }` | 主题切换 |

插件在主窗口信任环境运行（同 Obsidian 模型），不做沙箱隔离。`activate` 返回的清理函数会在插件停用 / 重建时调用。

## 🏗️ 项目结构

```
KairosMd/
├── main.go              # Wails 入口、无边框窗口、资源服务
├── files.go             # FileService：文件对话框/读取/配置/插件/主题目录
├── assets.go            # 本地媒体资源服务（/kfs）
├── frontend/
│   └── src/
│       ├── core/        # 扩展性核心层
│       │   ├── markdown/    # 渲染管线 + Shiki
│       │   ├── themes/      # 主题引擎 + 内置主题
│       │   ├── plugins/     # 插件运行时 + API
│       │   └── commands/    # 命令注册表 + 快捷键
│       ├── stores/      # Pinia：settings / library / ui
│       ├── components/  # Titlebar / Reader / CommandPalette / Toast
│       ├── views/       # Home / Settings / Plugins
│       └── style.css    # 全局样式 + Markdown 排版
└── samples/             # 示例 Markdown 文档
```

## 📜 许可

MIT
