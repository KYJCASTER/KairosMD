<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from './stores/ui'
import { useLibraryStore } from './stores/library'
import { useSettingsStore } from './stores/settings'
import { runCommand } from './core/commands/registry'
import Titlebar from './components/Titlebar.vue'
import TabBar from './components/TabBar.vue'
import DocView from './components/DocView.vue'
import ToastHost from './components/ToastHost.vue'
import CommandPalette from './components/CommandPalette.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import EffectsLayer from './components/EffectsLayer.vue'
import HomeView from './views/HomeView.vue'
import SettingsView from './views/SettingsView.vue'
import PluginsView from './views/PluginsView.vue'
import KIcon from './components/KIcon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const settings = useSettingsStore()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (ui.paletteOpen) {
      ui.togglePalette(false)
    } else if (ui.view !== 'reader') {
      ui.openView('reader')
    } else if (ui.immersive) {
      runCommand('view:immersive')
    }
  }
}

// 拖拽 .md 文件进窗口：WebView 拿不到绝对路径，读文本内容直接预览
function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const name = file.name.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdx') || name.endsWith('.txt')) {
    void file.text().then((content) => {
      lib.openDropped(file.name, content)
    })
  }
}

function prevent(e: Event) {
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('dragover', prevent)
  window.addEventListener('drop', (e) => {
    prevent(e)
    onDrop(e)
  })
  // 失焦时立即落盘草稿（崩溃恢复兜底）
  window.addEventListener('blur', () => lib.saveDraftNow())
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="k-app">
    <EffectsLayer v-if="settings.effectsOn" />
    <Titlebar v-show="!ui.immersive" />
    <TabBar v-if="!ui.immersive && lib.opened && ui.view === 'reader'" />

    <main class="k-main">
      <SettingsView v-if="ui.view === 'settings'" />
      <PluginsView v-else-if="ui.view === 'plugins'" />
      <template v-else>
        <!-- 每个标签一个 DocView（v-show 保活：切标签不丢撤销 / 滚动 / 模式） -->
        <DocView v-for="d in lib.docs" :key="d.id" v-show="d.id === lib.activeDocId" :doc="d" />
        <HomeView v-if="!lib.opened" />
      </template>
    </main>

    <div class="k-immersive-hint" v-if="ui.immersive" @click="runCommand('view:immersive')">
      <KIcon name="left" :size="13" /> Esc 退出沉浸
    </div>

    <ToastHost />
    <ConfirmDialog />
    <CommandPalette v-if="ui.paletteOpen" />
  </div>
</template>

<style scoped>
.k-app {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--k-bg);
}
.k-main {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  z-index: 2;
}
.k-immersive-hint {
  position: fixed;
  right: 18px;
  bottom: 16px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--k-text-soft);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(12px);
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.2s ease;
}
.k-immersive-hint:hover {
  opacity: 1;
}
</style>
