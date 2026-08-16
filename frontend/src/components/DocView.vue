<script setup lang="ts">
/** 文档视图容器：编辑 / 对比 / 预览三态 + 对比模式可拖动分隔条 + 双向滚动同步 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { bus } from '../core/events'
import EditorPane from './EditorPane.vue'
import ReaderView from './ReaderView.vue'

const lib = useLibraryStore()
const settings = useSettingsStore()

const showEditor = computed(() => lib.mode === 'split' || lib.mode === 'edit')
const showReader = computed(() => lib.mode === 'split' || lib.mode === 'read')

const docEl = ref<HTMLElement | null>(null)
const editorRef = ref<InstanceType<typeof EditorPane> | null>(null)
const readerRef = ref<InstanceType<typeof ReaderView> | null>(null)
const dragging = ref(false)
const splitVar = computed(() => `${(settings.splitRatio * 100).toFixed(3)}%`)

// ---------- 双向滚动同步：程序化滚动触发对端 scroll 事件，用锁防止互相触发的回环 ----------

let syncLock: 0 | 1 | 2 = 0 // 1 = 编辑器驱动，2 = 预览驱动
let syncTimer: ReturnType<typeof setTimeout> | undefined

function armLock(which: 1 | 2) {
  syncLock = which
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => (syncLock = 0), 150)
}

function onEditorScrolled() {
  if (!settings.scrollSync || syncLock === 2) return
  const ed = editorRef.value
  const rd = readerRef.value
  if (!ed || !rd) return
  armLock(1)
  const p = ed.topSyncPos()
  rd.scrollToSync(p.line, p.frac)
}

function onReaderScrolled() {
  if (!settings.scrollSync || syncLock === 1) return
  const ed = editorRef.value
  const rd = readerRef.value
  if (!ed || !rd) return
  armLock(2)
  const p = rd.topSyncPoint()
  ed.scrollToSync(p.line, p.frac)
}

function onJumpToLine(line: number) {
  editorRef.value?.cursorToLine(line)
}

function onToggleTask(line: number) {
  if (editorRef.value?.toggleTaskAtLine(line)) return
  lib.toggleTaskFallback(line)
}

// 大纲跳转：预览滚到锚点，编辑器光标同步落到源码行
const offTocGoto = bus.on('toc:goto', ({ id, line }) => {
  readerRef.value?.scrollToId(id)
  if (line > 0) editorRef.value?.cursorToLine(line)
})
onBeforeUnmount(() => offTocGoto())

onBeforeUnmount(() => clearTimeout(syncTimer))

let stopDrag: (() => void) | null = null

/** 拖动分隔条：按容器宽度百分比调节编辑区占比，钳制在 20% ~ 80% */
function onSplitterDown(e: MouseEvent) {
  const el = docEl.value
  if (!el) return
  e.preventDefault()
  dragging.value = true
  const rect = el.getBoundingClientRect()
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const onMove = (ev: MouseEvent) => {
    const ratio = (ev.clientX - rect.left) / rect.width
    settings.splitRatio = Math.min(0.8, Math.max(0.2, ratio))
  }
  const onUp = () => {
    dragging.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    settings.schedulePersist()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    stopDrag = null
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  stopDrag = onUp
}

/** 双击分隔条回到 50 / 50 */
function resetSplit() {
  settings.splitRatio = 0.5
  settings.schedulePersist()
}

onBeforeUnmount(() => stopDrag?.())
</script>

<template>
  <div ref="docEl" class="k-doc" :data-mode="lib.mode" :style="{ '--k-split': splitVar }">
    <!-- v-show 保活：切换模式不丢撤销历史 / 光标 / 滚动位置 -->
    <EditorPane
      ref="editorRef"
      v-show="showEditor"
      :model-value="lib.content"
      @update:model-value="lib.setContent($event)"
      @scrolled="onEditorScrolled"
    />
    <div
      v-if="lib.mode === 'split'"
      class="k-splitter"
      :class="{ drag: dragging }"
      title="拖动调节宽度 · 双击复位"
      @mousedown="onSplitterDown"
      @dblclick="resetSplit"
    />
    <ReaderView ref="readerRef" v-show="showReader" @scrolled="onReaderScrolled" @jump="onJumpToLine" @toggle-task="onToggleTask" />
  </div>
</template>

<style scoped>
.k-doc {
  flex: 1;
  min-width: 0;
  display: flex;
  height: 100%;
}
.k-doc[data-mode='split'] :deep(.k-editor-pane) {
  flex: none;
  width: var(--k-split);
  min-width: 180px;
  border-right: none;
}
.k-doc[data-mode='split'] :deep(.k-reader) {
  border-left: none;
}

.k-splitter {
  flex: none;
  width: 7px;
  position: relative;
  z-index: 5;
  cursor: col-resize;
  touch-action: none;
}
.k-splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: var(--k-border);
  transition: background 0.15s ease, left 0.15s ease, width 0.15s ease, border-radius 0.15s ease;
}
.k-splitter:hover::before,
.k-splitter.drag::before {
  left: 1px;
  width: 5px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--k-accent), var(--k-accent-2));
}
</style>
