<script setup lang="ts">
/** 确认弹窗：未保存保护等危险操作的轻量确认 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()

function confirm() {
  const cb = ui.confirm?.onConfirm
  ui.closeConfirm()
  cb?.()
}

// Esc 取消 / Enter 确认
function onKeydown(e: KeyboardEvent) {
  if (!ui.confirm) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    ui.denyConfirm()
  } else if (e.key === 'Enter') {
    e.stopPropagation()
    confirm()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="k-confirm">
      <div v-if="ui.confirm" class="k-confirm-mask" @mousedown.self="ui.denyConfirm()">
        <div class="k-confirm-card">
          <div class="k-confirm-kaomoji">(´･ω･`)</div>
          <p class="k-confirm-text">{{ ui.confirm.text }}</p>
          <p v-if="ui.confirm.detail" class="k-confirm-detail">{{ ui.confirm.detail }}</p>
          <div class="k-confirm-actions">
            <button class="k-btn" @click="ui.denyConfirm()">{{ ui.confirm.cancelText }}</button>
            <button class="k-btn k-btn-primary" @click="confirm()">{{ ui.confirm.confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.k-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 28%);
  backdrop-filter: blur(4px);
}
.k-confirm-card {
  width: min(88vw, 360px);
  padding: 26px 24px 20px;
  border-radius: var(--k-radius-sm);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  box-shadow: 0 18px 50px rgb(0 0 0 / 22%);
  text-align: center;
}
.k-confirm-kaomoji {
  font-size: 22px;
  color: var(--k-accent);
  margin-bottom: 10px;
}
.k-confirm-text {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--k-text);
  white-space: pre-line;
}
.k-confirm-detail {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--k-text-faint);
}
.k-confirm-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
.k-btn {
  min-width: 92px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--k-border);
  background: var(--k-surface2);
  color: var(--k-text-soft);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.k-btn:hover {
  color: var(--k-text);
  border-color: color-mix(in srgb, var(--k-accent) 40%, var(--k-border));
}
.k-btn-primary {
  border: none;
  color: var(--k-accent-contrast);
  background: linear-gradient(135deg, var(--k-accent), var(--k-accent-2));
  font-weight: 700;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--k-accent) 35%, transparent);
}
.k-btn-primary:hover {
  filter: brightness(1.06);
  color: var(--k-accent-contrast);
}

.k-confirm-enter-active,
.k-confirm-leave-active {
  transition: opacity 0.15s ease;
}
.k-confirm-enter-active .k-confirm-card,
.k-confirm-leave-active .k-confirm-card {
  transition: transform 0.15s ease;
}
.k-confirm-enter-from,
.k-confirm-leave-to {
  opacity: 0;
}
.k-confirm-enter-from .k-confirm-card,
.k-confirm-leave-to .k-confirm-card {
  transform: scale(0.96) translateY(6px);
}
</style>
