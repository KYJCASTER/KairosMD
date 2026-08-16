/** 文档仓库：当前文档内容与渲染结果、编辑模式、保存 */
import { defineStore } from 'pinia'
import type { TocItem } from '../core/types'
import { pipeline } from '../core/markdown/pipeline'
import { TASK_MARKER_RE } from '../core/editor/format'
import { bus } from '../core/events'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import { WindowSetTitle } from '../../wailsjs/runtime/runtime'
import { PickFile, ReadFile, WriteFile, SaveAsPath, SaveHtmlPath, QuitApp, SaveDraft, LoadDraft, DeleteDraft } from '../../wailsjs/go/main/Files'
import { buildExportHtml } from '../core/markdown/exportHtml'

export type DocMode = 'read' | 'split' | 'edit'

export const useLibraryStore = defineStore('library', {
  state: () => ({
    opened: false, // 是否已有文档会话（空白文档也算），控制 DocView 显示
    currentPath: '',
    currentName: '',
    content: '',
    savedContent: '', // 上次保存/加载的内容，用于判断 dirty
    html: '',
    toc: [] as TocItem[],
    activeId: '',
    ratio: 0,
    loading: false,
    error: '',
    mode: 'read' as DocMode,
    _renderTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    _renderDirty: false, // 有未渲染的内容变更（编辑模式下跳过渲染时置位）
    _draftTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }),

  getters: {
    hasDoc: (s) => s.currentPath !== '',
    // 只要存在文档会话就显示编辑器（空白文档 path/content 都为空，需要单独标志）
    hasContent: (s) => s.opened,
    dirty: (s) => s.content !== s.savedContent,
    canSave: (s) => s.content !== s.savedContent,
    // 是否需要走"另存为"（无磁盘路径）
    needSaveAs: (s) => s.currentPath === '' || s.currentPath.startsWith('dropped:'),
  },

  actions: {
    /** 有未保存修改时弹确认，确认后（同时清掉草稿）执行动作 */
    guardUnsaved(action: () => void, opts: { text?: string; confirmText?: string } = {}) {
      if (!this.dirty) {
        action()
        return
      }
      const draftPath = this.currentPath
      useUiStore().ask({
        text: opts.text ?? `「${this.currentName || '未命名'}」有未保存的修改`,
        detail: '此操作会丢弃这些修改',
        confirmText: opts.confirmText ?? '丢弃修改',
        onConfirm: () => {
          void DeleteDraft(draftPath)
          action()
        },
      })
    },

    /** 请求退出：未保存先确认（OnBeforeClose / 标题栏关闭按钮都汇到这里） */
    requestQuit() {
      if (!this.dirty) {
        void QuitApp()
        return
      }
      this.guardUnsaved(() => void QuitApp(), {
        text: `「${this.currentName || '未命名'}」有未保存的修改`,
        confirmText: '不保存并退出',
      })
    },

    async pickAndOpenFile() {
      try {
        const p = await PickFile()
        if (p) await this.openFile(p)
      } catch (e) {
        this.error = String(e)
      }
    },

    /** 新建空白文档，进入分屏编辑模式 */
    newFile(force = false) {
      const create = () => {
        this.opened = true
        this.currentPath = ''
        this.currentName = '未命名'
        this.content = ''
        this.savedContent = ''
        this.html = ''
        this.toc = []
        this.mode = 'split'
        this.error = ''
        void WindowSetTitle('未命名 · KairosMd')
        useUiStore().openView('reader')
        void this.checkDraft()
      }
      if (force) {
        create()
        return
      }
      this.guardUnsaved(create, { confirmText: '丢弃修改并新建' })
    },

    async openFile(path: string, opts: { keepScroll?: boolean; force?: boolean } = {}): Promise<boolean> {
      const load = async (): Promise<boolean> => {
        const keepScroll = opts.keepScroll ?? false
        this.loading = true
        this.error = ''
        try {
          const content = await ReadFile(path)
          this.opened = true
          this.currentPath = path
          this.currentName = this.basename(path)
          this.content = content
          this.savedContent = content
          this.render()
          if (!keepScroll) this.pushRecent(path)
          const settings = useSettingsStore()
          settings.lastFile = path
          settings.schedulePersist()
          void WindowSetTitle(`${this.currentName} · KairosMd`)
          useUiStore().openView('reader')
          bus.emit('reader:file-open', { path, content })
          void this.checkDraft()
          return true
        } catch (e) {
          this.error = `无法读取文件：${e}`
          useUiStore().toast(this.error, 'error')
          return false
        } finally {
          this.loading = false
        }
      }
      if (opts.force) return load()
      if (!this.dirty) return load()
      this.guardUnsaved(() => void load(), { confirmText: '丢弃修改并打开' })
      return false
    },

    /** 保存：有磁盘路径直接存，否则弹另存为对话框 */
    async saveFile() {
      if (!this.canSave) return
      let path = this.currentPath
      if (this.needSaveAs) {
        path = await this.pickSavePath()
        if (!path) return // 用户取消
      }
      await this.persistTo(path)
    },

    /** 另存为：无论有无磁盘路径都弹对话框，保存后切换到新文件 */
    async saveFileAs() {
      if (!this.opened) return
      const path = await this.pickSavePath()
      if (path) await this.persistTo(path, '已另存为')
    },

    async pickSavePath(): Promise<string> {
      const name = (this.currentName || '未命名') + (this.currentName.endsWith('.md') ? '' : '.md')
      try {
        return await SaveAsPath(name)
      } catch (e) {
        useUiStore().toast(`保存失败：${e}`, 'error')
        return ''
      }
    },

    /** 写盘并切换当前文档到该路径（保存 / 另存为共用） */
    async persistTo(path: string, toastText = '已保存') {
      if (!path) return
      const draftKey = this.currentPath // 保存前草稿按旧路径（可能是空串/拖入名）存
      try {
        await WriteFile(path, this.content)
        void DeleteDraft(draftKey)
        this.currentPath = path
        this.currentName = this.basename(path)
        this.savedContent = this.content
        this.pushRecent(path)
        const settings = useSettingsStore()
        settings.lastFile = path
        settings.schedulePersist()
        void WindowSetTitle(`${this.currentName} · KairosMd`)
        useUiStore().toast(toastText, 'success')
      } catch (e) {
        useUiStore().toast(`保存失败：${e}`, 'error')
      }
    },

    /** 拖入文件预览（WebView 拿不到绝对路径，保存时走另存为） */
    openDropped(name: string, content: string) {
      const load = () => {
        this.opened = true
        this.currentPath = `dropped:${name}`
        this.currentName = name
        this.content = content
        this.savedContent = content
        this.mode = 'split'
        this.render()
        void WindowSetTitle(`${name} · KairosMd`)
        useUiStore().openView('reader')
      }
      this.guardUnsaved(load, { confirmText: '丢弃修改并打开' })
    },

    /** 预览点击任务框但编辑器未挂载（纯预览模式）时，直接改源码字符串回写 */
    toggleTaskFallback(line: number) {
      const lines = this.content.split('\n')
      const i = line - 1
      if (i < 0 || i >= lines.length) return
      const m = TASK_MARKER_RE.exec(lines[i])
      if (!m) return
      const idx = m[1].length
      lines[i] = lines[i].slice(0, idx) + (m[2] === ' ' ? 'x' : ' ') + lines[i].slice(idx + 1)
      this.setContent(lines.join('\n'))
    },

    /** 导出为自包含 HTML（主题样式 + 本地图片 + 公式字体全部内嵌） */
    async exportHtmlFile() {
      if (!this.opened) return
      if (this._renderDirty) this.render()
      const base = this.currentName.replace(/\.(md|markdown|mdx)$/i, '') || '未命名'
      try {
        const path = await SaveHtmlPath(`${base}.html`)
        if (!path) return // 用户取消
        const doc = await buildExportHtml(this.html, this.currentName || 'KairosMd')
        await WriteFile(path, doc)
        useUiStore().toast('已导出 HTML', 'success')
      } catch (e) {
        useUiStore().toast(`导出失败：${e}`, 'error')
      }
    },

    /** 编辑器内容变化时调用：更新 content，防抖重渲染预览 */
    setContent(v: string) {
      if (this.content === v) return
      this.content = v
      this.scheduleRender()
      this.scheduleDraft()
    },

    // ---------- 崩溃恢复草稿：dirty 时防抖快照，失焦/关闭前立即落盘 ----------

    scheduleDraft(delay = 3000) {
      if (!this.dirty) return
      clearTimeout(this._draftTimer)
      this._draftTimer = setTimeout(() => this.saveDraftNow(), delay)
    },

    saveDraftNow() {
      clearTimeout(this._draftTimer)
      if (!this.dirty || !this.opened) return
      void SaveDraft(this.currentPath, this.currentName, this.content)
    },

    /** 打开文档后检查是否有可恢复的草稿（崩溃 / 强杀遗留） */
    async checkDraft() {
      try {
        const d = await LoadDraft(this.currentPath)
        if (!d) return
        if (d.content === this.content) {
          void DeleteDraft(this.currentPath)
          return
        }
        const diff = d.content.length - this.content.length
        useUiStore().ask({
          text: `发现「${d.name || this.currentName || '未命名'}」的未保存草稿`,
          detail: `${new Date(d.t).toLocaleString()} · 较当前内容${diff >= 0 ? '多' : '少'} ${Math.abs(diff)} 字`,
          confirmText: '恢复草稿',
          onConfirm: () => {
            this.setContent(d.content)
            useUiStore().toast('已恢复草稿内容', 'success')
          },
          onCancel: () => void DeleteDraft(this.currentPath),
        })
      } catch {
        // 草稿系统异常不影响主流程
      }
    },

    /** 打字高频触发，延迟合并渲染，降低大文档 CPU 占用；纯编辑模式下预览不可见则完全跳过 */
    scheduleRender(delay = 160) {
      this._renderDirty = true
      if (this.mode === 'edit') return
      clearTimeout(this._renderTimer)
      this._renderTimer = setTimeout(() => this.render(), delay)
    },

    /** 渲染当前内容 */
    render() {
      if (!this.opened) return
      clearTimeout(this._renderTimer)
      this._renderDirty = false
      const r = pipeline.render(this.content, { filePath: this.currentPath })
      this.html = r.html
      this.toc = r.toc
    },

    closeFile() {
      this.newFile()
    },

    setMode(mode: DocMode) {
      if (this.mode === mode) return
      this.mode = mode
      // 从纯编辑切回可见预览：补渲染编辑期间积压的变更
      if (mode !== 'edit' && this._renderDirty) this.render()
    },

    cycleMode() {
      const order: DocMode[] = ['read', 'split', 'edit']
      const i = order.indexOf(this.mode)
      this.setMode(order[(i + 1) % order.length])
    },

    pushRecent(path: string) {
      const settings = useSettingsStore()
      const name = this.basename(path)
      const list = [{ path, name, t: Date.now() }, ...settings.recent.filter((r) => r.path !== path)]
      settings.recent = list.slice(0, 12)
      settings.schedulePersist()
    },

    async boot(initialPath = '') {
      if (initialPath && await this.openFile(initialPath)) return

      const settings = useSettingsStore()
      if (settings.lastFile && await this.openFile(settings.lastFile)) return

      if (settings.lastFile) {
        settings.lastFile = ''
        settings.schedulePersist()
      }
      // 没有可恢复的文件：新建空白文档
      this.newFile()
    },

    setRatio(r: number) {
      this.ratio = r
    },
    setActiveId(id: string) {
      this.activeId = id
    },

    basename(path: string): string {
      const clean = path.replace(/\\/g, '/')
      return clean.slice(clean.lastIndexOf('/') + 1)
    },
  },
})
