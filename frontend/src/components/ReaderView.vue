<script setup lang="ts">
/** 阅读视图：渲染容器 + 进度条 + 滚动 spy + 阅读位置记忆 + 点击委托（外链/.md/锚点/剧透/跳源码行） */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { bus } from '../core/events'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'

const lib = useLibraryStore()
const settings = useSettingsStore()
const ui = useUiStore()

const emit = defineEmits<{ scrolled: []; jump: [line: number]; toggleTask: [line: number] }>()

const scrollEl = ref<HTMLElement | null>(null)
const articleEl = ref<HTMLElement | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let restoring = false

/** 滚动事件 → rAF 节流后通知父级（对比模式滚动同步用） */
let scrollRaf = 0
function emitScrolled() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    emit('scrolled')
  })
}

function onScroll() {
  const el = scrollEl.value
  if (!el || restoring) return
  emitScrolled()
  const max = el.scrollHeight - el.clientHeight
  lib.ratio = max > 0 ? Math.min(1, el.scrollTop / max) : 0

  // 滚动 spy：最后一个顶部越过阈值的标题
  const heads = articleEl.value?.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id]')
  if (heads && heads.length) {
    let active = ''
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= 110) active = h.id
      else break
    }
    lib.activeId = active
  }

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => settings.savePosition(lib.currentPath, lib.ratio), 600)
}

function restoreScroll() {
  const el = scrollEl.value
  if (!el) return
  restoring = true
  const r = settings.getPosition(lib.currentPath)
  el.scrollTop = r != null ? r * (el.scrollHeight - el.clientHeight) : 0
  requestAnimationFrame(() => {
    restoring = false
    onScroll()
  })
}

/** 点击委托：外链走系统浏览器、.md 链接在阅读器内打开、锚点平滑滚动、剧透揭开、任务框点选、普通文本跳源码行 */
function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!(target instanceof HTMLElement)) return

  const spoiler = target.closest<HTMLElement>('.k-spoiler')
  if (spoiler) {
    spoiler.classList.toggle('revealed')
    return
  }
  const task = target.closest<HTMLElement>('.k-task')
  if (task) {
    task.classList.toggle('on')
    // 回写源码：经 data-line 定位行，编辑器在时走编辑器事务（保留撤销栈）
    const line = Number(task.closest<HTMLElement>('[data-line]')?.dataset.line)
    if (line > 0) emit('toggleTask', line)
    return
  }
  const anchor = target.closest<HTMLAnchorElement>('a')
  if (anchor) {
    const href = anchor.getAttribute('href') ?? ''
    if (anchor.dataset.kExt) {
      e.preventDefault()
      void BrowserOpenURL(href)
      return
    }
    if (anchor.dataset.kMd) {
      e.preventDefault()
      void lib.openFile(anchor.dataset.kMd)
      return
    }
    if (href.startsWith('#')) {
      e.preventDefault()
      document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  // 普通点击（无选区）：跳到对应源码行
  if (window.getSelection()?.isCollapsed) {
    const block = target.closest<HTMLElement>('[data-line]')
    const line = Number(block?.dataset.line)
    if (line > 0) emit('jump', line)
  }
}

// ---------- 滚动同步：data-line 锚点缓存（html / 尺寸变化时失效） ----------

let syncEls: { el: HTMLElement; top: number; line: number }[] | null = null

function getSyncEls() {
  if (syncEls) return syncEls
  const list: { el: HTMLElement; top: number; line: number }[] = []
  const scroll = scrollEl.value
  const article = articleEl.value
  if (scroll && article) {
    // 内容原点在视口坐标中的位置：元素 rect.top - base = 元素在滚动内容中的位置
    const base = scroll.getBoundingClientRect().top - scroll.scrollTop
    for (const el of article.querySelectorAll<HTMLElement>('[data-line]')) {
      const line = Number(el.dataset.line)
      if (line > 0) list.push({ el, top: el.getBoundingClientRect().top - base, line })
    }
  }
  syncEls = list
  return list
}

/** 当前视口顶部对应的源码行与块内进度（0~1） */
function topSyncPoint(): { line: number; frac: number } {
  const els = getSyncEls()
  const st = scrollEl.value?.scrollTop ?? 0
  if (!els.length) return { line: 1, frac: 0 }
  let lo = 0
  let hi = els.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (els[mid].top <= st + 1) lo = mid
    else hi = mid - 1
  }
  const cur = els[lo]
  const nextTop = lo + 1 < els.length ? els[lo + 1].top : cur.top + cur.el.offsetHeight
  const span = Math.max(1, nextTop - cur.top)
  return { line: cur.line, frac: Math.min(1, Math.max(0, (st - cur.top) / span)) }
}

/** 滚动到指定源码行（frac 为块内进度） */
function scrollToSync(line: number, frac: number) {
  const els = getSyncEls()
  const scroll = scrollEl.value
  if (!els.length || !scroll) return
  let lo = 0
  let hi = els.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (els[mid].line <= line) lo = mid
    else hi = mid - 1
  }
  const cur = els[lo]
  const nextTop = lo + 1 < els.length ? els[lo + 1].top : cur.top + cur.el.offsetHeight
  const span = Math.max(1, nextTop - cur.top)
  scroll.scrollTop = cur.top + Math.min(1, Math.max(0, frac)) * span
}

/** 大纲跳转：滚动到标题锚点 */
function scrollToId(id: string) {
  const el = articleEl.value?.querySelector<HTMLElement>('#' + CSS.escape(id))
  const scroll = scrollEl.value
  if (el && scroll) {
    scroll.scrollTop = el.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 12
  }
}

defineExpose({ topSyncPoint, scrollToSync, scrollToId })

// 渲染完成钩子：文件切换 → 恢复记忆位置；同文件打字重渲染 → 按源码行锚定，内容增删不漂移
let lastRenderPath = ''
watch(
  () => lib.html,
  async () => {
    const fileChanged = lib.currentPath !== lastRenderPath
    let anchor: { line: number; frac: number } | null = null
    if (!fileChanged) anchor = topSyncPoint() // pre-flush：DOM 还是旧的
    await nextTick()
    lastRenderPath = lib.currentPath
    syncEls = null
    if (fileChanged) restoreScroll()
    else if (anchor) scrollToSync(anchor.line, anchor.frac)
    if (articleEl.value) bus.emit('reader:rendered', { path: lib.currentPath, el: articleEl.value })
  },
)

// 插件注册了新的 markdown 规则 / 语言补载完成 → 重渲染
const offRefresh = bus.on('markdown:refresh', () => lib.render())
const offLang = bus.on('lang:loaded', () => lib.render())
const offTheme = bus.on('theme:changed', () => lib.render())

// 图片异步加载、容器宽度变化都会改变锚点位置，ResizeObserver 失效缓存
let ro: ResizeObserver | null = null

onMounted(() => {
  lastRenderPath = lib.currentPath
  if (scrollEl.value && articleEl.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(() => (syncEls = null))
    ro.observe(scrollEl.value)
    ro.observe(articleEl.value)
  }
  if (lib.html) {
    restoreScroll()
    if (articleEl.value) bus.emit('reader:rendered', { path: lib.currentPath, el: articleEl.value })
  }
})
onBeforeUnmount(() => {
  offRefresh()
  offLang()
  offTheme()
  ro?.disconnect()
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})
</script>

<template>
  <div class="k-reader" :class="{ 'k-immersive-on': ui.immersive }">
    <div class="k-progress" :style="{ width: `${Math.round(lib.ratio * 100)}%` }" />
    <div ref="scrollEl" class="k-scroll" @scroll.passive="onScroll" @click="onClick">
      <div v-if="lib.loading" class="k-reader-state">
        <div class="k-kaomoji">(っ˘ω˘ς)</div>
        <p>加载中…</p>
      </div>
      <div v-else-if="lib.error" class="k-reader-state">
        <div class="k-kaomoji">(´;ω;`)</div>
        <p>{{ lib.error }}</p>
      </div>
      <article v-else ref="articleEl" class="k-md" v-html="lib.html" />
    </div>
  </div>
</template>

<style scoped>
.k-reader {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--k-bg);
}
.k-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  z-index: 30;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(90deg, var(--k-accent), var(--k-accent-2));
  transition: width 0.1s linear;
  pointer-events: none;
}
.k-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-top: 32px;
}
.k-md {
  width: min(var(--k-pw), 100% - 48px);
  margin: 28px auto 80px;
  font-size: var(--k-fs);
  line-height: var(--k-lh);
  font-family: var(--k-ff);
  color: var(--k-text);
}
.k-reader-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 120px 0;
  color: var(--k-text-faint);
}
.k-kaomoji {
  font-size: 34px;
  color: var(--k-accent);
}
</style>
