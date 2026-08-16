/** 极简事件总线：插件 API 与应用内部的解耦通信全靠它 */

export interface KairosEvents {
  'reader:file-open': { path: string; content: string }
  'reader:rendered': { path: string; el: HTMLElement }
  'settings:changed': Record<string, unknown>
  'theme:changed': { id: string; dark: boolean }
  'markdown:refresh': undefined
  'shiki:ready': undefined
  'lang:loaded': string
  /** 大纲跳转：预览滚动到锚点 + 编辑器光标落到源码行 */
  'toc:goto': { id: string; line: number }
}

type Handler<T> = (payload: T) => void

class EventBus {
  private map = new Map<string, Set<Handler<unknown>>>()

  on<K extends keyof KairosEvents>(key: K, fn: Handler<KairosEvents[K]>): () => void {
    let set = this.map.get(key)
    if (!set) {
      set = new Set()
      this.map.set(key, set)
    }
    set.add(fn as Handler<unknown>)
    return () => set!.delete(fn as Handler<unknown>)
  }

  emit<K extends keyof KairosEvents>(key: K, payload: KairosEvents[K]) {
    const set = this.map.get(key)
    if (!set) return
    for (const fn of [...set]) {
      try {
        fn(payload)
      } catch (e) {
        console.error(`[bus] handler error on "${key}"`, e)
      }
    }
  }
}

export const bus = new EventBus()
