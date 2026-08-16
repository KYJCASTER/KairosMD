/** UI 仓库：视图切换 / 命令面板 / 沉浸模式 / toast / 确认弹窗 */
import { defineStore } from 'pinia'

export interface Toast {
  id: number
  text: string
  type: 'default' | 'success' | 'error'
}

export interface ConfirmOptions {
  text: string
  detail?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  /** 取消 / Esc / 点遮罩时回调（如清理草稿） */
  onCancel?: () => void
}

export interface ConfirmState extends ConfirmOptions {
  confirmText: string
  cancelText: string
}

export type MainView = 'reader' | 'settings' | 'plugins'

export const useUiStore = defineStore('ui', {
  state: () => ({
    view: 'reader' as MainView,
    paletteOpen: false,
    immersive: false,
    statusText: '',
    toasts: [] as Toast[],
    _toastSeq: 0,
    confirm: null as ConfirmState | null,
  }),

  actions: {
    toast(text: string, type: Toast['type'] = 'default') {
      const id = ++this._toastSeq
      this.toasts.push({ id, text, type })
      setTimeout(() => this.dismiss(id), 3200)
    },
    dismiss(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
    /** 弹确认框（未保存保护等），确认后执行 onConfirm */
    ask(o: ConfirmOptions) {
      this.confirm = {
        ...o,
        confirmText: o.confirmText ?? '确定',
        cancelText: o.cancelText ?? '取消',
      }
    },
    closeConfirm() {
      this.confirm = null
    },
    /** 取消路径：先回调 onCancel 再关闭（closeConfirm 只在确认后清理用） */
    denyConfirm() {
      const cb = this.confirm?.onCancel
      this.confirm = null
      cb?.()
    },
    openView(view: MainView) {
      this.view = view
      this.immersive = false
    },
    togglePalette(force?: boolean) {
      this.paletteOpen = force ?? !this.paletteOpen
    },
    toggleImmersive(force?: boolean) {
      this.immersive = force ?? !this.immersive
    },
  },
})
