<script setup lang="ts">
/** 设置页：主题 / 排版 / 数据目录 */
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { themeEngine } from '../core/themes/engine'
import { ConfigDir, RevealPath } from '../../wailsjs/go/main/Files'
import KIcon from '../components/KIcon.vue'

const settings = useSettingsStore()
const ui = useUiStore()

const FONTS = [
  { id: 'auto', name: '系统默认' },
  { id: 'round', name: '圆体 Nunito' },
  { id: 'serif', name: '衬线' },
  { id: 'mono', name: 'JetBrains Mono' },
]

async function revealConfig() {
  try {
    const dir = await ConfigDir()
    if (dir) await RevealPath(dir)
  } catch (e) {
    ui.toast(`打开失败：${e}`, 'error')
  }
}

async function revealSub(sub: string) {
  try {
    const dir = await ConfigDir()
    if (dir) await RevealPath(dir + '\\' + sub)
  } catch {
    ui.toast('目录还不存在，先安装一个插件/主题再来吧', 'default')
  }
}

async function refreshThemes() {
  await themeEngine.refreshUserThemes()
  ui.toast(`已扫描到 ${themeEngine.list().length} 个主题`, 'success')
}
</script>

<template>
  <div class="k-settings-scroll">
    <div class="k-settings">
      <div class="k-view-head">
        <button class="k-back" @click="ui.openView('reader')" title="返回阅读（Esc）">
          <KIcon name="left" :size="14" /> 返回
        </button>
        <h1><KIcon name="gear" :size="18" /> 设置</h1>
      </div>

    <section class="k-card">
      <h2>主题</h2>
      <div class="k-theme-cards">
        <button
          v-for="t in themeEngine.list()"
          :key="t.id"
          class="k-theme-card"
          :class="{ on: t.id === settings.themeId }"
          @click="settings.setTheme(t.id)"
        >
          <span
            class="k-theme-preview"
            :style="{ background: t.bgLayers || t.colors.bg, color: t.colors.text }"
          >
            <span class="k-tp-dot" :style="{ background: t.colors.accent }" />
            <span class="k-tp-dot" :style="{ background: t.colors.accent2 }" />
            <span class="k-tp-line" />
          </span>
          <span class="k-theme-name">{{ t.name }}</span>
          <span class="k-theme-desc">{{ t.description }}</span>
        </button>
      </div>
      <div class="k-card-row">
        <button class="k-mini-btn" @click="refreshThemes"><KIcon name="refresh" :size="13" /> 重新扫描用户主题</button>
        <button class="k-mini-btn" @click="revealSub('themes')"><KIcon name="folder" :size="13" /> 打开主题目录</button>
      </div>
      <div class="k-font-row" style="margin-top: 14px">
        <span>主题特效</span>
        <div class="k-fonts">
          <button class="k-font-btn" :class="{ on: settings.effectsOn }" @click="settings.setEffects(true)">花瓣 / 星空 / 红叶 / 墨尘</button>
          <button class="k-font-btn" :class="{ on: !settings.effectsOn }" @click="settings.setEffects(false)">关闭</button>
        </div>
      </div>
    </section>

    <section class="k-card">
      <h2>排版</h2>
      <label class="k-slider-row">
        <span>字号 <b>{{ settings.fontSize }}px</b></span>
        <input type="range" min="13" max="24" step="0.5" :value="settings.fontSize"
          @input="settings.patchTypography({ fontSize: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="k-slider-row">
        <span>行距 <b>{{ settings.lineHeight }}</b></span>
        <input type="range" min="1.5" max="2.3" step="0.05" :value="settings.lineHeight"
          @input="settings.patchTypography({ lineHeight: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="k-slider-row">
        <span>页宽 <b>{{ settings.pageWidth }}px</b></span>
        <input type="range" min="620" max="1080" step="10" :value="settings.pageWidth"
          @input="settings.patchTypography({ pageWidth: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <div class="k-font-row">
        <span>字体</span>
        <div class="k-fonts">
          <button
            v-for="f in FONTS"
            :key="f.id"
            class="k-font-btn"
            :class="{ on: settings.fontFamily === f.id }"
            @click="settings.patchTypography({ fontFamily: f.id })"
          >
            {{ f.name }}
          </button>
        </div>
      </div>
      <div class="k-font-row">
        <span>编辑器字体</span>
        <div class="k-fonts">
          <button
            class="k-font-btn"
            :class="{ on: !settings.editorMono }"
            @click="settings.setEditorMono(false)"
          >
            跟随主题
          </button>
          <button class="k-font-btn" :class="{ on: settings.editorMono }" @click="settings.setEditorMono(true)">
            JetBrains Mono
          </button>
        </div>
      </div>
    </section>

    <section class="k-card">
      <h2>数据</h2>
      <div class="k-card-row">
        <button class="k-mini-btn" @click="revealConfig"><KIcon name="folder" :size="13" /> 打开配置目录</button>
        <button class="k-mini-btn" @click="ui.openView('plugins')"><KIcon name="plug" :size="13" /> 管理插件</button>
      </div>
      <p class="k-fine">配置与阅读进度保存在 %APPDATA%\KairosMd\config.json</p>
    </section>
    </div>
  </div>
</template>

<style scoped>
.k-settings-scroll {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
}
.k-settings {
  width: min(680px, 100% - 48px);
  margin: 20px auto 80px;
  display: flex;
  flex-direction: column;
  gap: 18px;
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
.k-card {
  padding: 18px 20px;
  border-radius: var(--k-radius);
  background: var(--k-surface);
  border: 1px solid var(--k-border);
  backdrop-filter: blur(16px) saturate(1.3);
}
h2 {
  font-size: 13px;
  color: var(--k-text-soft);
  margin-bottom: 14px;
}
.k-theme-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.k-theme-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  border-radius: 12px;
  border: 2px solid var(--k-border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}
.k-theme-card.on {
  border-color: var(--k-accent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--k-accent) 25%, transparent);
}
.k-theme-preview {
  height: 52px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid rgb(0 0 0 / 6%);
}
.k-tp-dot { width: 11px; height: 11px; border-radius: 50%; }
.k-tp-line { flex: 1; height: 5px; border-radius: 3px; background: currentColor; opacity: 0.25; }
.k-theme-name { font-size: 12.5px; font-weight: 700; color: var(--k-text); }
.k-theme-desc { font-size: 11px; color: var(--k-text-faint); }
.k-card-row { display: flex; gap: 9px; margin-top: 14px; flex-wrap: wrap; }
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
.k-slider-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 12.5px;
  color: var(--k-text-soft);
}
.k-slider-row b { color: var(--k-accent); }
input[type='range'] {
  width: 100%;
  height: 4px;
  appearance: none;
  border-radius: 4px;
  background: color-mix(in srgb, var(--k-accent) 25%, var(--k-border));
  outline: none;
}
input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--k-accent);
  border: 2.5px solid #fff;
  box-shadow: 0 1px 5px rgb(0 0 0 / 25%);
  cursor: pointer;
}
.k-font-row {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12.5px;
  color: var(--k-text-soft);
  flex-wrap: wrap;
}
.k-font-row + .k-font-row {
  margin-top: 18px;
}
.k-fonts { display: flex; gap: 8px; flex-wrap: wrap; }
.k-font-btn {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--k-border);
  background: var(--k-surface2);
  color: var(--k-text-soft);
  font-size: 12px;
  cursor: pointer;
}
.k-font-btn.on {
  color: var(--k-accent-contrast);
  background: linear-gradient(135deg, var(--k-accent), var(--k-accent-2));
  border-color: transparent;
  font-weight: 700;
}
.k-fine { margin-top: 12px; font-size: 11px; color: var(--k-text-faint); }
</style>
