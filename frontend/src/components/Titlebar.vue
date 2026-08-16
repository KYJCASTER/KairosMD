<script setup lang="ts">
/** 自定义无边框标题栏：左侧菜单按钮 + 文档名 + 窗口控制 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLibraryStore, type DocMode } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { themeEngine } from '../core/themes/engine'
import { runCommand } from '../core/commands/registry'
import { bus } from '../core/events'
import KIcon from './KIcon.vue'
import { WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime'

const lib = useLibraryStore()
const settings = useSettingsStore()
const ui = useUiStore()

const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const tocOpen = ref(false)
const tocEl = ref<HTMLElement | null>(null)

const title = computed(() => {
  if (!lib.currentName) return 'KairosMd'
  const star = lib.dirty ? ' ●' : ''
  return `${lib.currentName}${star}`
})

const modeLabel: Record<DocMode, string> = { read: '预览', split: '对比', edit: '编辑' }
const modeOrder: DocMode[] = ['edit', 'split', 'read']

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}
function closeMenu() {
  menuOpen.value = false
}
function run(id: string) {
  closeMenu()
  runCommand(id)
}
function setMode(m: DocMode) {
  lib.setMode(m)
  closeMenu()
}
function setTheme(id: string) {
  settings.setTheme(id)
  closeMenu()
}
function openRecent(path: string) {
  closeMenu()
  void lib.openFile(path)
}

function gotoToc(id: string, line: number) {
  tocOpen.value = false
  bus.emit('toc:goto', { id, line })
}

// 点击外部关闭菜单 / 大纲浮层
function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (menuOpen.value && menuEl.value && !menuEl.value.contains(t)) closeMenu()
  if (tocOpen.value && tocEl.value && !tocEl.value.contains(t)) tocOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <header class="k-titlebar" style="--wails-draggable: drag">
    <!-- 左侧菜单按钮 -->
    <div ref="menuEl" class="k-menu-zone" style="--wails-draggable: no-drag">
      <button class="k-menu-btn" :class="{ on: menuOpen }" @click="toggleMenu" title="菜单">
        <span class="k-logo"><KIcon name="petal" :size="15" /></span>
      </button>
      <Transition name="k-menu">
        <div v-if="menuOpen" class="k-menu-panel">
          <button class="k-mi" @click="run('app:new')"><KIcon name="file" :size="15" /><span>新建</span><kbd>Ctrl N</kbd></button>
          <button class="k-mi" @click="run('app:open-file')"><KIcon name="folder-open" :size="15" /><span>打开文件…</span><kbd>Ctrl O</kbd></button>

          <template v-if="settings.recent.length">
            <div class="k-mi-sep" />
            <div class="k-mi-label">最近</div>
            <button v-for="r in settings.recent.slice(0, 5)" :key="r.path" class="k-mi k-mi-sub" :title="r.path" @click="openRecent(r.path)">
              <KIcon name="file" :size="13" /><span class="k-mi-text">{{ r.name }}</span>
            </button>
          </template>

          <div class="k-mi-sep" />
          <div class="k-mi-label">模式</div>
          <button v-for="m in (['read','split','edit'] as DocMode[])" :key="m" class="k-mi" :class="{ check: lib.mode === m }" @click="setMode(m)">
            <KIcon :name="lib.mode === m ? 'check' : 'dot'" :size="13" /><span>{{ modeLabel[m] }}</span>
          </button>
          <button class="k-mi" @click="run('app:save')" :disabled="!lib.canSave"><KIcon name="save" :size="15" /><span>保存</span><kbd>Ctrl S</kbd></button>
          <button class="k-mi" @click="run('app:save-as')" :disabled="!lib.opened"><KIcon name="save" :size="15" /><span>另存为…</span><kbd>Ctrl ⇧ S</kbd></button>
          <button class="k-mi" @click="run('app:export-html')" :disabled="!lib.hasContent"><KIcon name="file" :size="15" /><span>导出 HTML…</span></button>

          <div class="k-mi-sep" />
          <div class="k-mi-label">主题</div>
          <button v-for="t in themeEngine.list()" :key="t.id" class="k-mi" :class="{ check: t.id === settings.themeId }" @click="setTheme(t.id)">
            <span class="k-mi-swatch" :style="{ background: `linear-gradient(135deg, ${t.colors.accent}, ${t.colors.accent2})` }" />
            <span>{{ t.name }}</span>
          </button>

          <div class="k-mi-sep" />
          <button class="k-mi" @click="run('view:palette')"><KIcon name="search" :size="15" /><span>命令面板</span><kbd>Ctrl K</kbd></button>
          <button class="k-mi" @click="run('app:settings')"><KIcon name="gear" :size="15" /><span>设置</span></button>
          <button class="k-mi" @click="run('app:plugins')"><KIcon name="plug" :size="15" /><span>插件</span></button>
        </div>
      </Transition>
    </div>

    <span class="k-doc-title" :title="title">{{ title }}</span>

    <div class="k-spacer" />

    <!-- 大纲浮层：长文档导航，预览与编辑器一起跳 -->
    <div v-if="lib.toc.length && ui.view === 'reader'" ref="tocEl" class="k-toc-zone" style="--wails-draggable: no-drag">
      <button class="k-menu-btn" :class="{ on: tocOpen }" title="大纲" @click="tocOpen = !tocOpen">
        <KIcon name="list" :size="16" />
      </button>
      <Transition name="k-menu">
        <div v-if="tocOpen" class="k-toc-panel">
          <div class="k-mi-label">大纲</div>
          <button
            v-for="t in lib.toc"
            :key="t.id"
            class="k-toc-item"
            :class="{ active: lib.activeId === t.id, [`lv${t.level}`]: true }"
            :title="t.text"
            @click="gotoToc(t.id, t.line)"
          >
            {{ t.text }}
          </button>
        </div>
      </Transition>
    </div>

    <div v-if="lib.opened && ui.view === 'reader'" class="k-mode-seg" style="--wails-draggable: no-drag" title="Ctrl+E 循环切换">
      <button
        v-for="m in modeOrder"
        :key="m"
        class="k-seg"
        :class="{ on: lib.mode === m }"
        @click="lib.setMode(m)"
      >
        {{ modeLabel[m] }}
      </button>
    </div>

    <div class="k-win-controls" style="--wails-draggable: no-drag">
      <button class="k-wc" title="最小化" @click="() => WindowMinimise()"><KIcon name="minus" :size="15" /></button>
      <button class="k-wc" title="最大化 / 还原" @click="() => WindowToggleMaximise()"><KIcon name="square" :size="12" /></button>
      <button class="k-wc k-wc-close" title="关闭" @click="() => lib.requestQuit()"><KIcon name="x" :size="15" /></button>
    </div>
  </header>
</template>

<style scoped>
.k-titlebar {
  height: var(--k-tb, 42px);
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 0 8px;
  background: var(--k-surface);
  border-bottom: 1px solid var(--k-border);
  backdrop-filter: blur(14px) saturate(1.35);
  user-select: none;
  position: relative;
  z-index: 50;
}
.k-menu-zone {
  position: relative;
}
.k-menu-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}
.k-menu-btn:hover,
.k-menu-btn.on {
  background: color-mix(in srgb, var(--k-accent) 14%, transparent);
}
.k-logo {
  display: grid;
  place-items: center;
  color: var(--k-accent-contrast);
  background: linear-gradient(135deg, var(--k-accent), var(--k-accent-2));
  border-radius: 7px;
  width: 22px;
  height: 22px;
  box-shadow: 0 1px 5px color-mix(in srgb, var(--k-accent) 40%, transparent);
}
.k-doc-title {
  font-size: 12.5px;
  color: var(--k-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40vw;
}
.k-spacer {
  flex: 1;
}
.k-toc-zone {
  position: relative;
}
.k-toc-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 300px;
  max-height: 64vh;
  overflow-y: auto;
  padding: 6px;
  border-radius: var(--k-radius-sm);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
  z-index: 100;
}
.k-toc-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--k-text-soft);
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s ease, color 0.12s ease;
}
.k-toc-item:hover {
  background: color-mix(in srgb, var(--k-accent) 12%, transparent);
  color: var(--k-text);
}
.k-toc-item.active {
  color: var(--k-accent);
  font-weight: 700;
}
.k-toc-item.lv1 { font-weight: 700; }
.k-toc-item.lv2 { padding-left: 26px; }
.k-toc-item.lv3 { padding-left: 40px; font-size: 12px; }
.k-toc-item.lv4 { padding-left: 54px; font-size: 12px; color: var(--k-text-faint); }
.k-mode-seg {
  display: flex;
  gap: 2px;
  margin-right: 8px;
  padding: 2px;
  border-radius: 9px;
  background: var(--k-surface2);
  border: 1px solid var(--k-border);
}
.k-seg {
  border: none;
  border-radius: 7px;
  padding: 4px 11px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--k-text-soft);
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.k-seg:hover {
  color: var(--k-text);
}
.k-seg.on {
  color: var(--k-accent-contrast);
  background: linear-gradient(135deg, var(--k-accent), var(--k-accent-2));
  font-weight: 700;
  box-shadow: 0 1px 5px color-mix(in srgb, var(--k-accent) 40%, transparent);
}
.k-win-controls {
  display: flex;
  gap: 2px;
}
.k-wc {
  width: 40px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--k-text-soft);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.k-wc:hover {
  background: color-mix(in srgb, var(--k-accent) 14%, transparent);
  color: var(--k-text);
}
.k-wc-close:hover {
  background: #ff5f57;
  color: #fff;
}

/* 浮层菜单 */
.k-menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 248px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 6px;
  border-radius: var(--k-radius-sm);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
  z-index: 100;
}
.k-mi {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--k-text);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.k-mi:hover:not(:disabled) {
  background: color-mix(in srgb, var(--k-accent) 12%, transparent);
}
.k-mi:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.k-mi span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-mi kbd {
  flex: none;
  font-family: inherit;
  font-size: 10px;
  color: var(--k-text-faint);
  background: var(--k-surface2);
  border: 1px solid var(--k-border);
  border-radius: 4px;
  padding: 1px 5px;
}
.k-mi-sub {
  padding-left: 28px;
  font-size: 12px;
  color: var(--k-text-soft);
}
.k-mi-text {
  font-size: 12px;
}
.k-mi.check {
  color: var(--k-accent);
  font-weight: 700;
}
.k-mi-sep {
  height: 1px;
  margin: 5px 8px;
  background: var(--k-border);
}
.k-mi-label {
  padding: 4px 12px 2px;
  font-size: 10.5px;
  color: var(--k-text-faint);
  font-weight: 700;
  letter-spacing: 0.5px;
}
.k-mi-swatch {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%);
}

.k-menu-enter-active,
.k-menu-leave-active {
  transition: all 0.16s ease;
}
.k-menu-enter-from,
.k-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
