/** 文档仓库：多标签页文档会话、渲染、保存、草稿、标签操作 */
import { defineStore } from 'pinia'
import type { TocItem } from '../core/types'
import { pipeline } from '../core/markdown/pipeline'
import { TASK_MARKER_RE } from '../core/editor/format'
import { bus } from '../core/events'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import { WindowSetTitle } from '../../wailsjs/runtime/runtime'
import {
  PickFile, ReadFile, WriteFile, SaveAsPath, SaveHtmlPath, QuitApp,
  SaveDraft, LoadDraft, DeleteDraft, OpenNewWindow, AllowDir,
} from '../../wailsjs/go/main/Files'

export type DocMode = 'read' | 'split' | 'edit'

/** 一个标签页 = 一个文档会话 */
export interface DocSession {
  id: string
  path: string // '' 未命名；dropped:xxx 拖入
  name: string
  content: string
  savedContent: string
  html: string
  toc: TocItem[]
  activeHeading: string
  ratio: number // 阅读进度
  mode: DocMode
  _renderTimer?: ReturnType<typeof setTimeout>
  _renderDirty: boolean
  _draftTimer?: ReturnType<typeof setTimeout>
}

let seq = 0
const newId = () => `doc-${Date.now().toString(36)}-${++seq}`

function blankSession(mode: DocMode = 'split'): DocSession {
  return {
    id: newId(),
    path: '',
    name: '未命名',
    content: '',
    savedContent: '',
    html: '',
    toc: [],
    activeHeading: '',
    ratio: 0,
    mode,
    _renderDirty: false,
  }
}

export const useLibraryStore = defineStore('library', {
  state: () => ({
    docs: [] as DocSession[],
    activeDocId: '',
    loading: false,
    error: '',
  }),

  getters: {
    activeDoc(s): DocSession | undefined {
      return s.docs.find((d) => d.id === s.activeDocId)
    },
    opened(): boolean {
      return this.docs.length > 0
    },
    // —— 以下 getter 委托到活跃标签，供旧调用方（标题栏 / 插件 API 等）无感兼容 ——
    hasContent(): boolean {
      return this.docs.length > 0
    },
    currentPath(): string {
      return this.activeDoc?.path ?? ''
    },
    currentName(): string {
      return this.activeDoc?.name ?? ''
    },
    content(): string {
      return this.activeDoc?.content ?? ''
    },
    dirty(): boolean {
      const d = this.activeDoc
      return !!d && d.content !== d.savedContent
    },
    canSave(): boolean {
      return this.dirty
    },
    needSaveAs(): boolean {
      const p = this.currentPath
      return p === '' || p.startsWith('dropped:')
    },
    html(): string {
      return this.activeDoc?.html ?? ''
    },
    toc(): TocItem[] {
      return this.activeDoc?.toc ?? []
    },
    activeId(): string {
      return this.activeDoc?.activeHeading ?? ''
    },
    mode(): DocMode {
      return this.activeDoc?.mode ?? 'read'
    },
    ratio(): number {
      return this.activeDoc?.ratio ?? 0
    },
    anyDirty: (s) => s.docs.some((d) => d.content !== d.savedContent),
  },

  actions: {
    // ---------- 标签页基础操作 ----------

    activateDoc(id: string) {
      const doc = this.docs.find((d) => d.id === id)
      if (!doc) return
      this.activeDocId = id
      void WindowSetTitle(`${doc.name}${doc.content !== doc.savedContent ? ' ●' : ''} · KairosMd`)
      if (doc.path && !doc.path.startsWith('dropped:')) {
        const settings = useSettingsStore()
        settings.lastFile = doc.path
        settings.schedulePersist()
      }
    },

    /** 新建空白标签页（不打扰现有标签，无丢弃风险故无需确认） */
    newTab() {
      const doc = blankSession()
      this.docs.push(doc)
      this.activateDoc(doc.id)
      useUiStore().openView('reader')
    },

    /** 兼容旧名：新建 */
    newFile() {
      this.newTab()
    },

    closeTab(docId: string, force = false) {
      const i = this.docs.findIndex((d) => d.id === docId)
      if (i < 0) return
      const doc = this.docs[i]
      const doClose = () => {
        void DeleteDraft(draftKey(doc))
        this.docs.splice(i, 1)
        if (this.docs.length === 0) {
          const blank = blankSession()
          this.docs.push(blank)
          this.activateDoc(blank.id)
        } else if (this.activeDocId === docId) {
          this.activateDoc(this.docs[Math.min(i, this.docs.length - 1)].id)
        }
      }
      if (force || doc.content === doc.savedContent) {
        doClose()
        return
      }
      useUiStore().ask({
        text: `「${doc.name}」有未保存的修改`,
        detail: '关闭标签会丢弃这些修改',
        confirmText: '丢弃并关闭',
        onConfirm: doClose,
      })
    },

    /** 兼容旧名：关闭当前标签 */
    closeFile() {
      if (this.activeDoc) this.closeTab(this.activeDoc.id)
    },

    nextTab(dir = 1) {
      if (this.docs.length < 2) return
      const i = this.docs.findIndex((d) => d.id === this.activeDocId)
      this.activateDoc(this.docs[(i + dir + this.docs.length) % this.docs.length].id)
    },

    /** 拖出标签 → 独立新窗口（新进程）。仅对已保存到磁盘的文档有效。 */
    async tearOffTab(docId: string) {
      const doc = this.docs.find((d) => d.id === docId)
      if (!doc) return
      if (!doc.path || doc.path.startsWith('dropped:') || doc.content !== doc.savedContent) {
        useUiStore().toast('先保存文档，再拖出为新窗口', 'default')
        return
      }
      try {
        await OpenNewWindow(doc.path)
        this.closeTab(docId, true)
        useUiStore().toast('已在新窗口打开', 'success')
      } catch (e) {
        useUiStore().toast(`新窗口打开失败：${e}`, 'error')
      }
    },

    // ---------- 未保存保护 ----------

    /** 请求退出：任一标签有未保存修改先确认 */
    requestQuit() {
      if (!this.anyDirty) {
        void QuitApp()
        return
      }
      const n = this.docs.filter((d) => d.content !== d.savedContent).length
      const keys = this.docs.filter((d) => d.content !== d.savedContent).map(draftKey)
      useUiStore().ask({
        text: n > 1 ? `${n} 篇文档有未保存的修改` : `「${this.currentName || '未命名'}」有未保存的修改`,
        detail: '退出会丢弃这些修改',
        confirmText: '不保存并退出',
        onConfirm: () => {
          for (const k of keys) void DeleteDraft(k)
          void QuitApp()
        },
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

    // ---------- 打开 ----------

    async openFile(path: string, opts: { reload?: boolean } = {}): Promise<boolean> {
      // 已打开过：直接激活该标签（reload 命令除外）
      const existing = this.docs.find((d) => d.path === path)
      if (existing && !opts.reload) {
        this.activateDoc(existing.id)
        useUiStore().openView('reader')
        return true
      }

      this.loading = true
      this.error = ''
      try {
        const content = await ReadFile(path)
        let doc = existing
        if (doc) {
          doc.content = content
          doc.savedContent = content
          this.renderSession(doc)
        } else {
          doc = blankSession(this.docs.length === 0 ? 'read' : 'split')
          doc.path = path
          doc.name = this.basename(path)
          doc.content = content
          doc.savedContent = content
          this.docs.push(doc)
          this.renderSession(doc)
          this.pushRecent(path)
        }
        this.activateDoc(doc.id)
        const settings = useSettingsStore()
        settings.lastFile = path
        settings.schedulePersist()
        // /kfs 白名单：允许加载该文档目录下的相对路径图片
        void AllowDir(path.replace(/\\/g, '/').replace(/\/[^/]*$/, ''))
        useUiStore().openView('reader')
        bus.emit('reader:file-open', { path, content })
        void this.checkDraft(doc)
        return true
      } catch (e) {
        this.error = `无法读取文件：${e}`
        useUiStore().toast(this.error, 'error')
        return false
      } finally {
        this.loading = false
      }
    },

    /** 拖入文件：新标签页打开（WebView 拿不到绝对路径，保存时走另存为） */
    openDropped(name: string, content: string) {
      const doc = blankSession()
      doc.path = `dropped:${name}`
      doc.name = name
      doc.content = content
      doc.savedContent = content
      this.docs.push(doc)
      this.renderSession(doc)
      this.activateDoc(doc.id)
      useUiStore().openView('reader')
    },

    // ---------- 保存 ----------

    async saveFile() {
      if (!this.canSave) return
      let path = this.currentPath
      if (this.needSaveAs) {
        path = await this.pickSavePath()
        if (!path) return // 用户取消
      }
      await this.persistTo(path)
    },

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

    /** 写盘并把当前标签切到该路径 */
    async persistTo(path: string, toastText = '已保存') {
      const doc = this.activeDoc
      if (!doc || !path) return
      const draftKeyPath = draftKey(doc)
      try {
        await WriteFile(path, doc.content)
        void DeleteDraft(draftKeyPath)
        doc.path = path
        doc.name = this.basename(path)
        doc.savedContent = doc.content
        this.pushRecent(path)
        const settings = useSettingsStore()
        settings.lastFile = path
        settings.schedulePersist()
        void WindowSetTitle(`${doc.name} · KairosMd`)
        useUiStore().toast(toastText, 'success')
      } catch (e) {
        useUiStore().toast(`保存失败：${e}`, 'error')
      }
    },

    /** 导出为自包含 HTML（主题样式 + 本地图片 + 公式字体全部内嵌） */
    async exportHtmlFile() {
      const doc = this.activeDoc
      if (!doc) return
      if (doc._renderDirty) this.renderSession(doc)
      const base = doc.name.replace(/\.(md|markdown|mdx)$/i, '') || '未命名'
      try {
        const path = await SaveHtmlPath(`${base}.html`)
        if (!path) return // 用户取消
        const { buildExportHtml } = await import('../core/markdown/exportHtml')
        const out = await buildExportHtml(doc.html, doc.name || 'KairosMd')
        await WriteFile(path, out)
        useUiStore().toast('已导出 HTML', 'success')
      } catch (e) {
        useUiStore().toast(`导出失败：${e}`, 'error')
      }
    },

    // ---------- 编辑与渲染 ----------

    setContentFor(docId: string, v: string) {
      const doc = this.docs.find((d) => d.id === docId)
      if (!doc || doc.content === v) return
      doc.content = v
      this.scheduleRenderFor(doc)
      this.scheduleDraftFor(doc)
    },

    /** 活跃标签快捷入口 */
    setContent(v: string) {
      if (this.activeDoc) this.setContentFor(this.activeDoc.id, v)
    },

    /** 打字高频触发，延迟合并渲染；纯编辑模式下预览不可见则完全跳过 */
    scheduleRenderFor(doc: DocSession, delay = 160) {
      doc._renderDirty = true
      if (doc.mode === 'edit') return
      clearTimeout(doc._renderTimer)
      doc._renderTimer = setTimeout(() => this.renderSession(doc), delay)
    },

    renderSession(doc?: DocSession) {
      if (!doc) return
      clearTimeout(doc._renderTimer)
      doc._renderDirty = false
      const r = pipeline.render(doc.content, { filePath: doc.path })
      doc.html = r.html
      doc.toc = r.toc
    },

    render() {
      this.renderSession(this.activeDoc)
    },

    setModeFor(doc: DocSession, mode: DocMode) {
      if (doc.mode === mode) return
      doc.mode = mode
      if (mode !== 'edit' && doc._renderDirty) this.renderSession(doc)
    },

    setMode(mode: DocMode) {
      if (this.activeDoc) this.setModeFor(this.activeDoc, mode)
    },

    cycleMode() {
      const order: DocMode[] = ['read', 'split', 'edit']
      const doc = this.activeDoc
      if (!doc) return
      const i = order.indexOf(doc.mode)
      this.setModeFor(doc, order[(i + 1) % order.length])
    },

    /** 预览点击任务框但编辑器不可用时，直接改源码字符串回写 */
    toggleTaskFor(docId: string, line: number) {
      const doc = this.docs.find((d) => d.id === docId)
      if (!doc) return
      const lines = doc.content.split('\n')
      const i = line - 1
      if (i < 0 || i >= lines.length) return
      const m = TASK_MARKER_RE.exec(lines[i])
      if (!m) return
      const idx = m[1].length
      lines[i] = lines[i].slice(0, idx) + (m[2] === ' ' ? 'x' : ' ') + lines[i].slice(idx + 1)
      this.setContentFor(docId, lines.join('\n'))
    },

    toggleTaskFallback(line: number) {
      if (this.activeDoc) this.toggleTaskFor(this.activeDoc.id, line)
    },

    // ---------- 崩溃恢复草稿 ----------

    draftKeyOf(doc: DocSession) {
      return draftKey(doc)
    },

    scheduleDraftFor(doc: DocSession, delay = 3000) {
      if (doc.content === doc.savedContent) return
      clearTimeout(doc._draftTimer)
      doc._draftTimer = setTimeout(() => {
        if (doc.content !== doc.savedContent) void SaveDraft(draftKey(doc), doc.name, doc.content)
      }, delay)
    },

    saveDraftNow() {
      for (const doc of this.docs) {
        clearTimeout(doc._draftTimer)
        if (doc.content !== doc.savedContent) void SaveDraft(draftKey(doc), doc.name, doc.content)
      }
    },

    /** 文档打开后检查是否有可恢复的草稿 */
    async checkDraft(doc: DocSession) {
      try {
        const key = draftKey(doc)
        const d = await LoadDraft(key)
        if (!d) return
        if (d.content === doc.content) {
          void DeleteDraft(key)
          return
        }
        const diff = d.content.length - doc.content.length
        useUiStore().ask({
          text: `发现「${d.name || doc.name}」的未保存草稿`,
          detail: `${new Date(d.t).toLocaleString()} · 较当前内容${diff >= 0 ? '多' : '少'} ${Math.abs(diff)} 字`,
          confirmText: '恢复草稿',
          onConfirm: () => {
            this.setContentFor(doc.id, d.content)
            useUiStore().toast('已恢复草稿内容', 'success')
          },
          onCancel: () => void DeleteDraft(key),
        })
      } catch {
        // 草稿系统异常不影响主流程
      }
    },

    // ---------- 启动 ----------

    pushRecent(path: string) {
      const settings = useSettingsStore()
      const name = this.basename(path)
      const list = [{ path, name, t: Date.now() }, ...settings.recent.filter((r) => r.path !== path)]
      settings.recent = list.slice(0, 12)
      settings.schedulePersist()
    },

    async boot(initialPath = '') {
      if (initialPath && (await this.openFile(initialPath))) return

      const settings = useSettingsStore()
      if (settings.lastFile && (await this.openFile(settings.lastFile))) return

      if (settings.lastFile) {
        settings.lastFile = ''
        settings.schedulePersist()
      }
      this.newTab()
    },

    basename(path: string): string {
      const clean = path.replace(/\\/g, '/')
      return clean.slice(clean.lastIndexOf('/') + 1)
    },
  },
})

function draftKey(doc: DocSession): string {
  return doc.path || `untitled:${doc.id}`
}
