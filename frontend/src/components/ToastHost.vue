<script setup lang="ts">
import { useUiStore } from '../stores/ui'
import KIcon from './KIcon.vue'

const ui = useUiStore()
</script>

<template>
  <div class="k-toasts">
    <TransitionGroup name="k-toast">
      <div v-for="t in ui.toasts" :key="t.id" class="k-toast" :data-type="t.type" @click="ui.dismiss(t.id)">
        <KIcon :name="t.type === 'error' ? 'x' : 'petal'" :size="14" />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.k-toasts {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 200;
  pointer-events: none;
}
.k-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--k-text);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(14px);
  box-shadow: 0 6px 24px rgb(0 0 0 / 12%);
  cursor: pointer;
  max-width: 76vw;
}
.k-toast[data-type='success'] { color: var(--k-accent); }
.k-toast[data-type='error'] { color: #ff5f57; }
.k-toast-enter-active,
.k-toast-leave-active { transition: all 0.25s ease; }
.k-toast-enter-from,
.k-toast-leave-to { opacity: 0; transform: translateY(10px); }
</style>
