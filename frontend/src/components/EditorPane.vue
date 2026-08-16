<script setup lang="ts">
/**
 * CodeMirror 6 编辑器组件：顶部格式工具栏 + markdown 智能按键。
 * - Enter 自动续写列表/任务列表，空列表项回车退出列表
 * - ** ~ ` 等符号自动配对
 * - 粘贴 URL 到选区上自动变链接/图片
 * - Ctrl+B/I、Ctrl+Shift+X/C 快速加粗/斜体/删除线/行内代码
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { closeBrackets } from '@codemirror/autocomplete'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownKeymap } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { kairosEditorTheme, kairosHighlighting } from '../core/editor/theme'
import { toggleWrap, toggleLinePrefix, cycleHeading, insertLink, insertCodeBlock, insertTable, insertHr, toggleTaskLine } from '../core/editor/format'
import { runCommand } from '../core/commands/registry'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { SaveClipboardImage } from '../../wailsjs/go/main/Files'
import KIcon from './KIcon.vue'

const props = defineProps<{ modelValue: string; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string]; scrolled: [] }>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

/** 滚动事件 → rAF 节流后通知父级（对比模式滚动同步用） */
let scrollRaf = 0
function onCmScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    emit('scrolled')
  })
}

/** 贴图：保存到文档同目录 assets/ 并插入语法；贴 URL 到选区上 → 链接/图片语法 */
const smartPaste = EditorView.domEventHandlers({
  paste(event, v) {
    if (props.readOnly) return false
    const items = event.clipboardData?.items
    if (items) {
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) {
            event.preventDefault()
            void savePastedImage(v, file)
            return true
          }
        }
      }
    }
    const url = (event.clipboardData?.getData('text/plain') ?? '').trim()
    const sel = v.state.selection.main
    if (!/^https?:\/\/\S+$/i.test(url) || sel.empty) return false
    event.preventDefault()
    const label = v.state.sliceDoc(sel.from, sel.to)
    const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|avif)([?#]|$)/i.test(url)
    v.dispatch({ changes: { from: sel.from, to: sel.to, insert: `${isImage ? '!' : ''}[${label}](${url})` } })
    return true
  },
})

/** 截图粘贴 → 落盘 assets/ + 插入相对路径引用（预览经 /kfs 正常显示） */
async function savePastedImage(v: EditorView, file: File) {
  const lib = useLibraryStore()
  const ui = useUiStore()
  const docPath = lib.currentPath.replace(/\\/g, '/')
  if (!docPath || docPath.startsWith('dropped:')) {
    ui.toast('先保存文档（Ctrl+S），再粘贴图片', 'default')
    return
  }
  const docDir = docPath.slice(0, docPath.lastIndexOf('/'))
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `贴图-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`
  try {
    const b64 = await blobToBase64(file)
    const full = await SaveClipboardImage(`${docDir}/assets`, name, b64)
    const rel = full.replace(/\\/g, '/').slice(docDir.length + 1)
    const sel = v.state.selection.main
    const nl = sel.from > 0 && v.state.sliceDoc(sel.from - 1, sel.from) !== '\n' ? '\n' : ''
    v.dispatch({ changes: { from: sel.from, to: sel.to, insert: `${nl}![${name}](${rel})\n` } })
  } catch (e) {
    ui.toast(`图片保存失败：${e}`, 'error')
  }
}

function blobToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
  })
}

const extensions: Extension[] = [
  history(),
  lineNumbers(),
  kairosEditorTheme,
  kairosHighlighting,
  markdown({ codeLanguages: languages }),
  EditorView.lineWrapping,
  search({ top: true }),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  // markdownKeymap 需在 defaultKeymap 前：Enter 续写列表、Backspace 删除标记
  keymap.of([
    { key: 'Mod-b', preventDefault: true, run: (v) => toggleWrap(v, '**') },
    { key: 'Mod-i', preventDefault: true, run: (v) => toggleWrap(v, '*') },
    { key: 'Mod-Shift-x', preventDefault: true, run: (v) => toggleWrap(v, '~~') },
    { key: 'Mod-Shift-c', preventDefault: true, run: (v) => toggleWrap(v, '`') },
    { key: 'Mod-s', preventDefault: true, run: () => (runCommand('app:save'), true) },
    { key: 'Mod-Shift-s', preventDefault: true, run: () => (runCommand('app:save-as'), true) },
  ]),
  keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
  closeBrackets(),
  // markdown 符号自动配对：** ` ~ $$（此版本 closeBrackets 无参，配置经 languageData 供给）
  EditorState.languageData.of(() => [
    { closeBrackets: { brackets: ['(', '[', '{', '"', "'", '`', '**', '~', '$$'] } },
  ]),
  smartPaste,
  EditorView.updateListener.of((u) => {
    if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
  }),
  EditorState.readOnly.of(props.readOnly ?? false),
]

onMounted(() => {
  if (!host.value) return
  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions }),
    parent: host.value,
  })
  view.scrollDOM.addEventListener('scroll', onCmScroll)
})

// 外部内容变化（打开新文件）同步到编辑器，避免光标抖动只在新值不同时更新
watch(
  () => props.modelValue,
  (v) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (v !== current) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: v },
        selection: { anchor: 0 },
      })
    }
  },
)

onBeforeUnmount(() => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  view?.scrollDOM.removeEventListener('scroll', onCmScroll)
  view?.destroy()
})

// ---------- 滚动同步接口（DocView 双向仲裁调用） ----------

/** 视口顶部对应的源码行与行内进度 */
function topSyncPos(): { line: number; frac: number } {
  if (!view) return { line: 1, frac: 0 }
  const rect = view.scrollDOM.getBoundingClientRect()
  const pos = view.posAtCoords({ x: rect.left + Math.min(80, rect.width / 2), y: rect.top + 4 })
  if (pos == null) return { line: 1, frac: 0 }
  const l = view.state.doc.lineAt(pos)
  const span = Math.max(1, l.to - l.from)
  return { line: l.number, frac: Math.min(1, Math.max(0, (pos - l.from) / span)) }
}

/** 滚动到指定源码行（frac 为行内进度） */
function scrollToSync(line: number, frac: number) {
  if (!view) return
  const doc = view.state.doc
  if (line < 1 || line > doc.lines) return
  const l = doc.line(line)
  const block = view.lineBlockAt(l.from)
  view.scrollDOM.scrollTop = block.top + Math.min(1, Math.max(0, frac)) * block.height
}

/** 预览点击跳转：光标落到该行并居中 */
function cursorToLine(line: number) {
  if (!view) return
  const doc = view.state.doc
  const l = doc.line(Math.min(Math.max(1, line), doc.lines))
  view.dispatch({
    selection: { anchor: l.from },
    effects: EditorView.scrollIntoView(l.from, { y: 'center' }),
  })
  view.focus()
}

/** 预览点击任务框：直接翻转源码该行勾选（走编辑器事务，保留撤销栈） */
function toggleTaskAtLine(line: number): boolean {
  if (!view) return false
  return toggleTaskLine(view, line)
}

defineExpose({ topSyncPos, scrollToSync, cursorToLine, toggleTaskAtLine })

// ---------- 工具栏 ----------

type ToolAction = { icon: string; title: string; run: (v: EditorView) => boolean }

const tools: ToolAction[] = [
  { icon: 'heading', title: '标题（循环 H1-H3）', run: cycleHeading },
  { icon: 'bold', title: '加粗（Ctrl+B）', run: (v) => toggleWrap(v, '**') },
  { icon: 'italic', title: '斜体（Ctrl+I）', run: (v) => toggleWrap(v, '*') },
  { icon: 'strike', title: '删除线（Ctrl+Shift+X）', run: (v) => toggleWrap(v, '~~') },
  { icon: 'code', title: '行内代码（Ctrl+Shift+C）', run: (v) => toggleWrap(v, '`') },
  { icon: 'link', title: '链接', run: (v) => insertLink(v) },
  { icon: 'image', title: '图片', run: (v) => insertLink(v, true) },
  { icon: 'quote', title: '引用', run: (v) => toggleLinePrefix(v, '> ') },
  { icon: 'list', title: '无序列表', run: (v) => toggleLinePrefix(v, '- ') },
  { icon: 'task', title: '任务列表', run: (v) => toggleLinePrefix(v, '- [ ] ') },
  { icon: 'codeblock', title: '代码块', run: insertCodeBlock },
  { icon: 'table', title: '表格', run: insertTable },
  { icon: 'hr', title: '分割线', run: insertHr },
  { icon: 'search', title: '查找 / 替换（Ctrl+F）', run: (v) => openSearchPanel(v) },
]

function runTool(t: ToolAction) {
  if (view) t.run(view)
}

const wordCount = computed(() => props.modelValue.replace(/\s/g, '').length)
const wordLabel = computed(() => (wordCount.value > 9999 ? `${(wordCount.value / 10000).toFixed(1)} 万字` : `${wordCount.value} 字`))
</script>

<template>
  <div class="k-editor-pane">
    <div class="k-editbar">
      <div class="k-editbar-tools">
        <button
          v-for="t in tools"
          :key="t.icon"
          class="k-tool"
          :title="t.title"
          tabindex="-1"
          @mousedown.prevent
          @click="runTool(t)"
        >
          <KIcon :name="t.icon" :size="15" />
        </button>
      </div>
      <span class="k-wordcount">{{ wordLabel }}</span>
    </div>
    <div ref="host" class="k-cm-host" />
  </div>
</template>

<style scoped>
.k-editor-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--k-surface);
  border-right: 1px solid var(--k-border);
  display: flex;
  flex-direction: column;
}
.k-editbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--k-border);
  background: var(--k-surface2);
}
.k-editbar-tools {
  display: flex;
  align-items: center;
  gap: 1px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.k-editbar-tools::-webkit-scrollbar {
  display: none;
}
.k-tool {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--k-text-soft);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.k-tool:hover {
  background: color-mix(in srgb, var(--k-accent) 14%, transparent);
  color: var(--k-text);
}
.k-tool:active {
  background: color-mix(in srgb, var(--k-accent) 24%, transparent);
}
.k-wordcount {
  flex: none;
  margin-left: auto;
  font-size: 10.5px;
  color: var(--k-text-faint);
  white-space: nowrap;
}
.k-cm-host {
  flex: 1;
  min-height: 0;
}
.k-editor-pane :deep(.cm-editor) {
  height: 100%;
}
.k-editor-pane :deep(.cm-scroller) {
  overflow-y: auto;
}
</style>
