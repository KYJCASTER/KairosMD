<script setup lang="ts">
/** 标签栏：多文档标签 + 新建 + 关闭 + 拖出标签拆分为新窗口（浏览器式） */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useLibraryStore, type DocSession } from '../stores/library'
import KIcon from './KIcon.vue'

const lib = useLibraryStore()
const stripEl = ref<HTMLElement | null>(null)

let dragDoc: DocSession | null = null
let insideStrip = false

function onDragStart(e: DragEvent, d: DocSession) {
  dragDoc = d
  insideStrip = true
  e.dataTransfer?.setData('application/x-kairos-tab', d.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onStripDragOver() {
  insideStrip = true
}

/** 拖拽经过标签栏以外 → 标记在外，松手即拆分新窗口 */
function onWindowDragOver(e: DragEvent) {
  if (!dragDoc) return
  const t = e.target as Node | null
  insideStrip = !!(t && stripEl.value?.contains(t))
}

function onStripDrop(e: DragEvent) {
  e.preventDefault()
  insideStrip = true
}

function onDragEnd() {
  const d = dragDoc
  dragDoc = null
  const out = !insideStrip
  insideStrip = false
  if (d && out) void lib.tearOffTab(d.id)
}

function close(docId: number | string) {
  lib.closeTab(String(docId))
}

onMounted(() => {
  window.addEventListener('dragover', onWindowDragOver)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onWindowDragOver)
})
</script>

<template>
  <div class="k-tabbar" style="--wails-draggable: drag">
    <div ref="stripEl" class="k-tabs" style="--wails-draggable: no-drag" @dragover="onStripDragOver" @drop="onStripDrop">
      <div
        v-for="d in lib.docs"
        :key="d.id"
        class="k-tab"
        :class="{ active: d.id === lib.activeDocId, dirty: d.content !== d.savedContent }"
        draggable="true"
        :title="d.path && !d.path.startsWith('dropped:') ? `${d.path}\n拖出标签可在新窗口打开` : '拖出标签可在新窗口打开'"
        @dragstart="onDragStart($event, d)"
        @dragend="onDragEnd"
        @click="lib.activateDoc(d.id)"
        @mouseup.middle.prevent="close(d.id)"
        @auxclick.middle.prevent
      >
        <span class="k-tab-dot" />
        <span class="k-tab-title">{{ d.name }}</span>
        <button class="k-tab-x" :title="`关闭 ${d.name}`" @click.stop="close(d.id)">
          <KIcon name="x" :size="11" />
        </button>
      </div>
    </div>
    <button class="k-tab-new" style="--wails-draggable: no-drag" title="新建标签（Ctrl+N）" @click="lib.newTab()">
      <KIcon name="plus" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.k-tabbar {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 5px 8px 0;
  background: var(--k-surface);
  border-bottom: 1px solid var(--k-border);
  user-select: none;
  position: relative;
  z-index: 40;
}
.k-tabs {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.k-tabs::-webkit-scrollbar {
  display: none;
}
.k-tab {
  flex: 0 1 auto;
  min-width: 96px;
  max-width: 190px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 11px;
  border-radius: 9px 9px 0 0;
  background: transparent;
  color: var(--k-text-soft);
  font-size: 12px;
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.12s ease, color 0.12s ease;
}
.k-tab:hover {
  background: color-mix(in srgb, var(--k-accent) 8%, transparent);
  color: var(--k-text);
}
.k-tab.active {
  background: var(--k-surface2);
  color: var(--k-text);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--k-accent);
}
.k-tab-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--k-accent) 60%, transparent);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.k-tab.dirty .k-tab-dot {
  opacity: 1;
}
.k-tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-tab-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--k-text-faint);
  cursor: pointer;
  opacity: 0;
  transition: all 0.12s ease;
}
.k-tab:hover .k-tab-x,
.k-tab.active .k-tab-x {
  opacity: 1;
}
.k-tab-x:hover {
  background: color-mix(in srgb, var(--k-accent) 18%, transparent);
  color: var(--k-text);
}
.k-tab-new {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-bottom: 3px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--k-text-soft);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.k-tab-new:hover {
  background: color-mix(in srgb, var(--k-accent) 14%, transparent);
  color: var(--k-text);
}
</style>
