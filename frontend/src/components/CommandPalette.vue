<script setup lang="ts">
/** 命令面板：Ctrl+K，列出内置 + 插件命令，回车执行 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { listCommands, runCommand } from '../core/commands/registry'
import { useUiStore } from '../stores/ui'
import KIcon from './KIcon.vue'

const ui = useUiStore()
const input = ref('')
const sel = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const items = computed(() => {
  const q = input.value.trim().toLowerCase()
  const all = listCommands()
  if (!q) return all.slice(0, 40)
  return all
    .filter((c) => `${c.title} ${c.id} ${c.group}`.toLowerCase().includes(q))
    .slice(0, 40)
})

function pick(id: string) {
  ui.togglePalette(false)
  runCommand(id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    sel.value = (sel.value + 1) % Math.max(1, items.value.length)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    sel.value = (sel.value - 1 + items.value.length) % Math.max(1, items.value.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const c = items.value[sel.value]
    if (c) pick(c.id)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    ui.togglePalette(false)
  }
}

function hotkeyText(hotkeys?: string[]): string {
  if (!hotkeys?.length) return ''
  return hotkeys[0].replace('mod', 'Ctrl').replace(/\+/g, '+').replace('arrowleft', '←')
}

onMounted(async () => {
  await nextTick()
  inputEl.value?.focus()
})
</script>

<template>
  <div class="k-palette-mask" @click.self="ui.togglePalette(false)">
    <div class="k-palette">
      <div class="k-palette-input">
        <KIcon name="search" :size="15" />
        <input
          ref="inputEl"
          v-model="input"
          placeholder="输入命令名…（↑↓ 选择，回车执行，Esc 关闭）"
          @input="sel = 0"
          @keydown="onKeydown"
        />
      </div>
      <div class="k-palette-list" v-if="items.length">
        <button
          v-for="(c, i) in items"
          :key="c.id"
          class="k-palette-item"
          :class="{ sel: i === sel }"
          @mouseenter="sel = i"
          @click="pick(c.id)"
        >
          <span class="k-pi-title">{{ c.title }}</span>
          <span class="k-pi-group">{{ c.group }}</span>
          <kbd v-if="hotkeyText(c.hotkeys)">{{ hotkeyText(c.hotkeys) }}</kbd>
        </button>
      </div>
      <div class="k-palette-empty" v-else>没有匹配的命令 (。•́︿•̀。)</div>
    </div>
  </div>
</template>

<style scoped>
.k-palette-mask {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--k-bg) 45%, transparent);
  backdrop-filter: blur(3px);
  z-index: 300;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}
.k-palette {
  width: min(560px, 90vw);
  border-radius: var(--k-radius);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 18px 60px rgb(0 0 0 / 22%);
  overflow: hidden;
  animation: k-pop 0.18s ease;
}
@keyframes k-pop {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
}
.k-palette-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  color: var(--k-text-faint);
  border-bottom: 1px solid var(--k-border);
}
.k-palette-input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--k-text);
  font-size: 14px;
}
.k-palette-input input::placeholder { color: var(--k-text-faint); }
.k-palette-list {
  max-height: 46vh;
  overflow-y: auto;
  padding: 8px;
}
.k-palette-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--k-text);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.k-palette-item.sel {
  background: linear-gradient(135deg, color-mix(in srgb, var(--k-accent) 20%, transparent), color-mix(in srgb, var(--k-accent-2) 20%, transparent));
}
.k-pi-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-pi-group { font-size: 11px; color: var(--k-text-faint); flex: none; }
.k-palette-item kbd {
  flex: none;
  font-family: inherit;
  font-size: 10.5px;
  color: var(--k-text-soft);
  background: var(--k-surface2);
  border: 1px solid var(--k-border);
  border-radius: 5px;
  padding: 1px 6px;
}
.k-palette-empty {
  padding: 26px;
  text-align: center;
  color: var(--k-text-faint);
  font-size: 13px;
}
</style>
