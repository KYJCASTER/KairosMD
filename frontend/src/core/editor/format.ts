/**
 * Markdown 格式化命令：编辑器工具栏与快捷键共用。
 * 全部返回 boolean 供 CodeMirror keymap 使用。
 */
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * 任务列表行标记：捕获组 1 = `[` 前的全部前缀（含引用符/列表符/空白），组 2 = 勾选状态字符。
 * 预览点击任务框回写源码时用。
 */
export const TASK_MARKER_RE = /^((?:\s|>)*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/

/** 翻转某行的任务勾选状态；成功（该行确实是任务项）返回 true */
export function toggleTaskLine(view: EditorView, line: number): boolean {
  const doc = view.state.doc
  if (line < 1 || line > doc.lines) return false
  const l = doc.line(line)
  const m = TASK_MARKER_RE.exec(l.text)
  if (!m) return false
  const idx = l.from + m[1].length
  view.dispatch({ changes: { from: idx, to: idx + 1, insert: m[2] === ' ' ? 'x' : ' ' } })
  return true
}

/** 用 marker 包裹/取消包裹选区（**、*、~~、`）；空选区时插入一对并把光标放中间 */
export function toggleWrap(view: EditorView, marker: string): boolean {
  const ml = marker.length
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to)
      if (range.empty) {
        const before = view.state.sliceDoc(Math.max(0, range.from - ml), range.from)
        const after = view.state.sliceDoc(range.to, Math.min(view.state.doc.length, range.to + ml))
        if (before === marker && after === marker) {
          return {
            changes: [
              { from: range.from - ml, to: range.from },
              { from: range.to, to: range.to + ml },
            ],
            range: EditorSelection.cursor(range.from - ml),
          }
        }
        return {
          changes: { from: range.from, insert: marker + marker },
          range: EditorSelection.cursor(range.from + ml),
        }
      }
      if (text.length >= ml * 2 && text.startsWith(marker) && text.endsWith(marker)) {
        const inner = text.slice(ml, -ml)
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        }
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + ml, range.to + ml),
      }
    }),
  )
  return true
}

/** 给选区涉及的所有行加/去前缀（>、- 、- [ ] 等）：全有则去掉，否则补上 */
export function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { state } = view
  const changes: { from: number; to?: number; insert?: string }[] = []

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from)
    const last = state.doc.lineAt(range.to)
    let all = true
    for (let l = first.number; l <= last.number; l++) {
      if (!state.doc.line(l).text.startsWith(prefix)) {
        all = false
        break
      }
    }
    for (let l = first.number; l <= last.number; l++) {
      const line = state.doc.line(l)
      if (all) {
        changes.push({ from: line.from, to: line.from + prefix.length })
      } else if (!line.text.startsWith(prefix)) {
        changes.push({ from: line.from, insert: prefix })
      }
    }
  }
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

/** 标题循环：无 → H1 → H2 → H3 → 无（按选区首行当前级别） */
export function cycleHeading(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  const first = state.doc.lineAt(range.from)
  const last = state.doc.lineAt(range.to)
  const m = /^(#{1,6})\s+/.exec(first.text)
  const next = m ? (m[1].length + 1) % 4 : 1

  const changes: { from: number; to?: number; insert?: string }[] = []
  for (let l = first.number; l <= last.number; l++) {
    const line = state.doc.line(l)
    const mm = /^(#{1,6})\s+/.exec(line.text)
    if (mm) {
      changes.push({
        from: line.from,
        to: line.from + mm[0].length,
        insert: next ? '#'.repeat(next) + ' ' : '',
      })
    } else if (next) {
      changes.push({ from: line.from, insert: '#'.repeat(next) + ' ' })
    }
  }
  view.dispatch({ changes })
  return true
}

/** 插入链接/图片：有选区时作为文字，光标落在括号内待填地址 */
export function insertLink(view: EditorView, image = false): boolean {
  const range = view.state.selection.main
  const text = view.state.sliceDoc(range.from, range.to)
  const p = image ? '!' : ''
  if (text) {
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${p}[${text}]()` },
      selection: { anchor: range.from + p.length + text.length + 3 },
    })
  } else {
    view.dispatch({
      changes: { from: range.from, insert: `${p}[]()` },
      selection: { anchor: range.from + p.length + 1 },
    })
  }
  return true
}

/** 选区包上代码块围栏（已是代码块则解开） */
export function insertCodeBlock(view: EditorView): boolean {
  const range = view.state.selection.main
  const text = view.state.sliceDoc(range.from, range.to)
  const fence = '```'
  if (text.startsWith(fence) && text.endsWith(fence) && text.length >= fence.length * 2 + 2) {
    const inner = text.split('\n').slice(1, -1).join('\n')
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: { anchor: range.from, head: range.from + inner.length },
    })
    return true
  }
  const atLineStart = range.from === 0 || view.state.sliceDoc(range.from - 1, range.from) === '\n'
  const open = (atLineStart ? '' : '\n') + fence + '\n'
  const close = '\n' + fence
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: open + text + close },
    selection: { anchor: range.from + open.length - 1 },
  })
  return true
}

/** 插入 3×3 表格骨架 */
export function insertTable(view: EditorView): boolean {
  const range = view.state.selection.main
  const atLineStart = range.from === 0 || view.state.sliceDoc(range.from - 1, range.from) === '\n'
  const table = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n'
  const insert = (atLineStart ? '' : '\n') + table
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
  })
  return true
}

/** 插入分割线 */
export function insertHr(view: EditorView): boolean {
  const range = view.state.selection.main
  const atLineStart = range.from === 0 || view.state.sliceDoc(range.from - 1, range.from) === '\n'
  const insert = (atLineStart ? '' : '\n\n') + '---\n\n'
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
  })
  return true
}
