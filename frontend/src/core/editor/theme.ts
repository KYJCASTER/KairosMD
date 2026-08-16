/**
 * CodeMirror 6 主题：全部用 CSS 变量，跟随 KairosMd 主题切换。
 * 语法高亮颜色也用 var()，明暗主题自动适配。
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** 编辑器基础主题：透明背景、圆角、跟随 --k-* 变量 */
export const kairosEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--k-text)',
    height: '100%',
    fontSize: 'var(--k-fs)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--k-editor-ff, var(--k-ff))',
    lineHeight: 'var(--k-lh)',
    padding: '28px 0 80px',
  },
  '.cm-content': {
    caretColor: 'var(--k-accent)',
    maxWidth: 'var(--k-pw)',
    margin: '0 auto',
    padding: '0 32px',
  },
  '.cm-line': { padding: '0' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--k-text-faint)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--k-accent) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--k-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--k-accent) 25%, transparent) !important',
  },
  '.cm-cursor': { borderLeftColor: 'var(--k-accent)', borderLeftWidth: '2px' },
  '.cm-panels': {
    backgroundColor: 'var(--k-surface)',
    color: 'var(--k-text)',
    borderTop: '1px solid var(--k-border)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--k-accent) 30%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--k-accent) 50%, transparent)' },
})

/** 语法高亮：颜色全用 var()，跟随主题 */
export const kairosHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--k-accent)', fontWeight: '800', fontSize: '1.4em' },
  { tag: t.heading2, color: 'var(--k-accent)', fontWeight: '800', fontSize: '1.25em' },
  { tag: t.heading3, color: 'var(--k-accent-2)', fontWeight: '700', fontSize: '1.1em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: 'var(--k-accent-2)', fontWeight: '700' },
  { tag: t.strong, color: 'var(--k-text)', fontWeight: '800' },
  { tag: t.emphasis, color: 'var(--k-text-soft)', fontStyle: 'italic' },
  { tag: t.strikethrough, color: 'var(--k-text-faint)', textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--k-link)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--k-link)' },
  { tag: t.monospace, color: 'var(--k-code-text)', backgroundColor: 'var(--k-code-bg)', borderRadius: '4px' },
  { tag: t.quote, color: 'var(--k-text-soft)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--k-accent)' },
  { tag: t.meta, color: 'var(--k-text-faint)' },
  { tag: t.processingInstruction, color: 'var(--k-text-faint)' },
  { tag: t.contentSeparator, color: 'var(--k-accent)' },
  { tag: t.comment, color: 'var(--k-text-faint)', fontStyle: 'italic' },
  { tag: [t.keyword, t.operator, t.punctuation], color: 'var(--k-text-soft)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--k-accent-2)' },
  { tag: [t.number, t.bool], color: 'var(--k-accent)' },
])

export const kairosHighlighting = syntaxHighlighting(kairosHighlightStyle)
