<script setup lang="ts">
/** 插件管理页：内置 + 外部插件列表，启停开关，插件目录入口 */
import { onMounted, ref } from 'vue'
import { pluginRuntime, type InstalledPlugin } from '../core/plugins/runtime'
import { useUiStore } from '../stores/ui'
import { ConfigDir, RevealPath } from '../../wailsjs/go/main/Files'
import KIcon from '../components/KIcon.vue'

const ui = useUiStore()
const plugins = ref<InstalledPlugin[]>([])

function reload() {
  plugins.value = pluginRuntime.listInstalled()
}

async function toggle(p: InstalledPlugin, on: boolean) {
  // S3：外部插件以应用全权限执行（可读写已授权文件、访问 DOM），启用前要求显式确认
  if (on && !p.builtin) {
    ui.ask({
      text: `启用外部插件「${p.manifest.name}」？`,
      detail: '外部插件代码会以应用完整权限运行，请确认插件来源可信',
      confirmText: '信任并启用',
      onConfirm: () => void enablePlugin(p),
    })
    return
  }
  await enablePlugin(p)
}

async function enablePlugin(p: InstalledPlugin) {
  await pluginRuntime.setEnabled(p.manifest.id, !p.enabled)
  reload()
  ui.toast(`${p.manifest.name} 已${p.enabled ? '启用' : '停用'}`, 'success')
}

async function rescan() {
  await pluginRuntime.rescan()
  reload()
}

async function openDir() {
  try {
    const dir = await ConfigDir()
    if (dir) await RevealPath(dir + '\\plugins')
  } catch {
    ui.toast('打开失败', 'error')
  }
}

onMounted(reload)
</script>

<template>
  <div class="k-plugins-scroll">
    <div class="k-plugins">
      <div class="k-view-head">
        <button class="k-back" @click="ui.openView('reader')" title="返回阅读（Esc）">
          <KIcon name="left" :size="14" /> 返回
        </button>
        <h1><KIcon name="plug" :size="18" /> 插件</h1>
      </div>

    <div class="k-plug-card" v-for="p in plugins" :key="p.manifest.id">
      <div class="k-plug-info">
        <div class="k-plug-title">
          <b>{{ p.manifest.name }}</b>
          <span class="k-ver">v{{ p.manifest.version }}</span>
          <span class="k-tag" :class="p.builtin ? 'k-tag-b' : 'k-tag-e'">{{ p.builtin ? '内置' : '外部' }}</span>
          <span v-if="p.error" class="k-tag k-tag-err" :title="p.error">初始化失败</span>
        </div>
        <p class="k-plug-desc">{{ p.manifest.description || '（无描述）' }}</p>
        <p class="k-plug-meta">{{ p.manifest.author ? 'by ' + p.manifest.author + ' · ' : '' }}{{ p.manifest.id }}</p>
      </div>
      <button class="k-switch" :class="{ on: p.enabled }" role="switch" :aria-checked="p.enabled" @click="toggle(p, !p.enabled)">
        <span class="k-knob" />
      </button>
    </div>

    <div class="k-plug-actions">
      <button class="k-mini-btn" @click="rescan"><KIcon name="refresh" :size="13" /> 重新扫描</button>
      <button class="k-mini-btn" @click="openDir"><KIcon name="folder" :size="13" /> 打开插件目录</button>
      <button class="k-mini-btn" @click="ui.openView('settings')"><KIcon name="gear" :size="13" /> 返回设置</button>
    </div>

    <p class="k-plug-doc">
      外部插件放这里：%APPDATA%\KairosMd\plugins\&lt;插件id&gt;\　—— manifest.json + main.js<br />
      main.js 中通过全局 <code>kairos</code> 对象注册命令 / 注入 Markdown 语法 / 监听事件，详见项目 README。
    </p>
    </div>
  </div>
</template>

<style scoped>
.k-plugins-scroll {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
}
.k-plugins {
  width: min(680px, 100% - 48px);
  margin: 20px auto 80px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.k-view-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.k-back {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 13px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--k-border);
  background: var(--k-surface2);
  color: var(--k-text-soft);
  cursor: pointer;
  transition: all 0.15s ease;
}
.k-back:hover {
  color: var(--k-accent);
  border-color: color-mix(in srgb, var(--k-accent) 50%, transparent);
}
h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 19px;
  color: var(--k-text);
}
.k-plug-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 15px 18px;
  border-radius: var(--k-radius);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(16px) saturate(1.3);
}
.k-plug-info { flex: 1; min-width: 0; }
.k-plug-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.k-plug-title b { font-size: 13.5px; color: var(--k-text); }
.k-ver { font-size: 11px; color: var(--k-text-faint); }
.k-tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 99px;
  font-weight: 700;
}
.k-tag-b { background: color-mix(in srgb, var(--k-accent) 16%, transparent); color: var(--k-accent); }
.k-tag-e { background: color-mix(in srgb, var(--k-accent2) 30%, transparent); color: var(--k-text); }
.k-tag-err { background: rgb(255 95 87 / 15%); color: #ff5f57; }
.k-plug-desc { font-size: 12px; color: var(--k-text-soft); margin-top: 4px; }
.k-plug-meta { font-size: 11px; color: var(--k-text-faint); margin-top: 3px; }
.k-switch {
  flex: none;
  width: 40px;
  height: 23px;
  border-radius: 999px;
  border: none;
  background: color-mix(in srgb, var(--k-text) 18%, transparent);
  cursor: pointer;
  position: relative;
  transition: background 0.2s ease;
}
.k-switch.on { background: linear-gradient(135deg, var(--k-accent), var(--k-accent-2)); }
.k-knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 3%);
  transition: transform 0.2s ease;
}
.k-switch.on .k-knob { transform: translateX(17px); }
.k-plug-actions { display: flex; gap: 9px; flex-wrap: wrap; }
.k-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 13px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--k-border);
  background: var(--k-surface2);
  color: var(--k-text-soft);
  cursor: pointer;
  transition: all 0.15s ease;
}
.k-mini-btn:hover { color: var(--k-accent); border-color: color-mix(in srgb, var(--k-accent) 50%, transparent); }
.k-plug-doc {
  font-size: 11.5px;
  line-height: 2;
  color: var(--k-text-faint);
}
.k-plug-doc code {
  background: var(--k-code-bg);
  color: var(--k-code-text);
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
