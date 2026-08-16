<script setup lang="ts">
/** 内联 SVG 图标集：圆润线条风格，避免引入图标库 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })

const paths: Record<string, string> = {
  // 文件夹（闭合）
  folder:
    'M3 6.5A2.5 2.5 0 0 1 5.5 4h3l2 2.5h8A2.5 2.5 0 0 1 21 9v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z',
  // 文档
  file: 'M6 3.75h7L18.25 9v11.25H6V3.75Zm7 0V9h5.25M9 13h6M9 16.5h6',
  // 书本（logo 用）
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm0 15A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z',
  // 设置齿轮
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5-.1 1.6 1.7 1.3-1.6 2.8-2-.7-1.4 1-.3 2.1h-3.2l-.3-2.1-1.4-1-2 .7-1.6-2.8 1.7-1.3L9 12l-.1-1.6L7.2 9.1l1.6-2.8 2 .7 1.4-1 .3-2.1h3.2l.3 2.1 1.4 1 2-.7 1.6 2.8-1.7 1.3.1 1.6Z',
  // 插头
  plug: 'M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-4 4.9V21h-2v-5.1A5 5 0 0 1 7 11V8Z',
  // 搜索
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.8-.2L20 21.5',
  // 左箭头
  left: 'M14.5 5.5 8 12l6.5 6.5',
  // 折叠箭头（右）
  chevron: 'm9 5.5 7 6.5-7 6.5',
  // 下箭头
  down: 'm5.5 9 6.5 7 6.5-7',
  // 窗口控制：最小化 / 最大化 / 关闭
  minus: 'M5 12h14',
  square: 'M6.5 6.5h11v11h-11z',
  copy: 'M8 8h11v11H8V8Zm-3 8V5h11',
  // 关闭 X
  x: 'M6 6l12 12M18 6 6 18',
  // 勾选
  check: 'm5 12 4.5 4.5L19 7',
  // 圆点
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  // 保存（软盘）
  save: 'M5 4h11l3 3v13H5V4Zm3 0v5h7V4M8 14h8v6H8z',
  // 樱花花瓣
  petal: 'M12 3c2.2 2.5 3.4 5.4 3.4 9 0 3.6-1.2 6.5-3.4 9-2.2-2.5-3.4-5.4-3.4-9 0-3.6 1.2-6.5 3.4-9Zm0 0C14 5.5 17 6.3 20 8.5c-1.2 2.7-3 4.6-5.4 5.7M12 3C10 5.5 7 6.3 4 8.5c1.2 2.7 3 4.6 5.4 5.7',
  // 星星
  spark: 'M12 3l1.8 5.7L19.5 10l-4.6 3.4L16 19l-4-2.8L8 19l1.1-5.6L4.5 10l5.7-1.3L12 3Z',
  // 刷新
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5',
  // 列表（大纲）
  list: 'M4.5 6.5h2m-2 5.5h2m-2 5.5h2m4-11h9m-9 5.5h9m-9 5.5h9',
  // 亮度/对比（特效）
  effects: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  // 文件夹打开
  'folder-open':
    'M3 6.5A2.5 2.5 0 0 1 5.5 4h3l2 2.5h6A2.5 2.5 0 0 1 19 9v1M3 6.5V18a2 2 0 0 0 2 2h13.2a1.8 1.8 0 0 0 1.7-1.3L21.5 13H7.6a1.8 1.8 0 0 0-1.7 1.3L3 20',
  // 编辑工具栏
  heading: 'M6 5v14M18 5v14M6 12h12',
  plus: 'M12 5v14M5 12h14',
  bold: 'M8 5h5.2a3.4 3.4 0 0 1 0 6.8H8V5Zm0 6.8h6a3.6 3.6 0 0 1 0 7.2H8v-7.2Z',
  italic: 'M15.5 5H9.5M14.5 19H8.5M14.5 5 9.5 19',
  strike: 'M5 12h14M8.5 8.5C8.5 7 10 6 12 6s3.5 1 3.5 2.5M15.5 15.5C15.5 17 14 18 12 18s-3.5-1-3.5-2.5',
  code: 'M8.5 7.5 4.5 12l4 4.5M15.5 7.5l4 4.5-4 4.5',
  codeblock: 'M4.5 5h15v14h-15zM9.5 9.5 7.5 12l2 2.5M14.5 9.5l2 2.5-2 2.5',
  quote: 'M9.5 6.5v5c0 2.6-1.2 4.4-3.5 5.3M18.5 6.5v5c0 2.6-1.2 4.4-3.5 5.3',
  link: 'M10 14l4-4M8.5 11l-2 2a3.2 3.2 0 0 0 4.5 4.5l2-2M15.5 13l2-2a3.2 3.2 0 0 0-4.5-4.5l-2 2',
  image: 'M4.5 5.5h15v13h-15zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M4.5 16l5-4.5 3 2.5 2.5-2 4.5 4',
  table: 'M4.5 5.5h15v13h-15zM4.5 10h15M4.5 14.5h15M10.5 5.5v13',
  task: 'M5 5.5h14v13H5zM8.5 12l2.6 2.6L16 9.5',
  hr: 'M4 12h16M7 6.5h10M7 17.5h10',
}

const strokeOnly = new Set([
  'chevron', 'down', 'left', 'minus', 'square', 'copy', 'search', 'gear', 'plug', 'file', 'refresh', 'list', 'effects', 'folder', 'folder-open', 'x', 'check', 'save', 'plus',
  'heading', 'italic', 'strike', 'code', 'codeblock', 'quote', 'link', 'image', 'table', 'task', 'hr',
])
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    :fill="strokeOnly.has(props.name) ? 'none' : 'currentColor'"
    :stroke="strokeOnly.has(props.name) ? 'currentColor' : 'none'"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[props.name] ?? paths.file" />
  </svg>
</template>
