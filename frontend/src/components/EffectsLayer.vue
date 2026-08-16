<script setup lang="ts">
/**
 * 主题特效层：跟随主题的轻量 Canvas 粒子。
 * 樱→飘落花瓣｜宙→闪烁星空 + 流星｜枫→旋转红叶｜墨→极淡墨尘。
 * rAF + 时间步进，窗口隐藏自动暂停；pointer-events: none，不影响交互。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const canvasEl = ref<HTMLCanvasElement | null>(null)

type Kind = 'petal' | 'leaf' | 'star' | 'dust'

interface Particle {
  kind: Kind
  x: number
  y: number
  size: number
  vx: number
  vy: number
  rot: number
  vr: number
  swayAmp: number
  swayFreq: number
  phase: number
  color: string
  alpha: number
  twinkle: number
}

interface Shooting {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
}

const PALETTES: Record<string, { kind: Kind; colors: string[]; count: number }> = {
  sakura: { kind: 'petal', colors: ['#f9b8ce', '#f27ba5', '#ffd3e0', '#ff9ec2'], count: 24 },
  sora: { kind: 'star', colors: ['#e8e8ff', '#c39bff', '#8ea8ff', '#ffffff'], count: 36 },
  kaede: { kind: 'leaf', colors: ['#e8743f', '#f5a45c', '#d15827', '#ffb87a'], count: 18 },
  sumi: { kind: 'dust', colors: ['#52525b', '#71717a', '#a1a1aa'], count: 14 },
}

let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let shooting: Shooting | null = null
let nextShootingAt = 0
let raf = 0
let lastT = 0
let running = false
let w = 0
let h = 0

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

function spawn(top = false): Particle {
  const pal = PALETTES[settings.themeId] ?? PALETTES.kaede
  const size = pal.kind === 'star' ? rand(1.2, 3.2) : pal.kind === 'dust' ? rand(0.8, 1.8) : rand(5, 12)
  const vy =
    pal.kind === 'petal' ? rand(26, 60) : pal.kind === 'leaf' ? rand(20, 48) : pal.kind === 'star' ? rand(-4, 4) : rand(-5, 5)
  return {
    kind: pal.kind,
    x: rand(0, w),
    y: top ? -20 : rand(0, h),
    size,
    vx: pal.kind === 'star' ? rand(-6, 6) : pal.kind === 'dust' ? rand(-3, 3) : rand(-8, 8),
    vy,
    rot: rand(0, Math.PI * 2),
    vr: pal.kind === 'leaf' ? rand(0.8, 2.2) * (Math.random() > 0.5 ? 1 : -1) : rand(-0.6, 0.6),
    swayAmp: pal.kind === 'dust' ? rand(2, 6) : rand(14, 42),
    swayFreq: rand(0.4, 1.1),
    phase: rand(0, Math.PI * 2),
    color: pick(pal.colors),
    alpha: pal.kind === 'dust' ? rand(0.05, 0.12) : pal.kind === 'star' ? rand(0.35, 0.9) : rand(0.5, 0.9),
    twinkle: rand(0.6, 2.4),
  }
}

function rebuild() {
  const pal = PALETTES[settings.themeId] ?? PALETTES.kaede
  particles = Array.from({ length: pal.count }, () => spawn())
  shooting = null
  nextShootingAt = performance.now() + rand(4000, 10000)
}

// ---------- 各主题粒子形状 ----------

function pathPetal(c: CanvasRenderingContext2D, s: number) {
  c.beginPath()
  c.moveTo(0, -s)
  c.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.7, s * 0.45, 0, s)
  c.bezierCurveTo(-s * 0.7, s * 0.45, -s * 0.85, -s * 0.55, 0, -s)
  c.closePath()
}

/** 简化枫叶：锯齿星形轮廓，小尺寸下可读 */
const LEAF_PTS: Array<[number, number]> = [
  [0, -1], [0.24, -0.5], [0.66, -0.62], [0.5, -0.18], [1, -0.22], [0.56, 0.16],
  [0.74, 0.62], [0.3, 0.42], [0.14, 1], [-0.14, 1], [-0.3, 0.42], [-0.74, 0.62],
  [-0.56, 0.16], [-1, -0.22], [-0.5, -0.18], [-0.66, -0.62], [-0.24, -0.5],
]
function pathLeaf(c: CanvasRenderingContext2D, s: number) {
  c.beginPath()
  c.moveTo(LEAF_PTS[0][0] * s, LEAF_PTS[0][1] * s)
  for (let i = 1; i < LEAF_PTS.length; i++) c.lineTo(LEAF_PTS[i][0] * s, LEAF_PTS[i][1] * s)
  c.closePath()
}

function pathStar4(c: CanvasRenderingContext2D, s: number) {
  const k = s * 0.24
  c.beginPath()
  c.moveTo(0, -s)
  c.lineTo(k, -k); c.lineTo(s, 0); c.lineTo(k, k)
  c.lineTo(0, s); c.lineTo(-k, k); c.lineTo(-s, 0); c.lineTo(-k, -k)
  c.closePath()
}

// ---------- 主循环 ----------

function frame(t: number) {
  if (!running) return
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016)
  lastT = t
  const c = ctx
  if (!c) return
  c.clearRect(0, 0, w, h)
  const now = t / 1000

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.x += (p.vx + Math.sin(now * p.swayFreq + p.phase) * p.swayAmp) * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt

    if (p.kind === 'petal' || p.kind === 'leaf') {
      if (p.y > h + 24 || p.x < -40 || p.x > w + 40) {
        particles[i] = spawn(true)
        continue
      }
    } else {
      if (p.y < -10) p.y = h + 8
      if (p.y > h + 10) p.y = -8
      if (p.x < -10) p.x = w + 8
      if (p.x > w + 10) p.x = -8
    }

    let alpha = p.alpha
    if (p.kind === 'star') alpha = p.alpha * (0.55 + 0.45 * Math.sin(now * p.twinkle + p.phase))
    if (p.kind === 'dust') alpha = p.alpha * (0.7 + 0.3 * Math.sin(now * p.twinkle * 0.5 + p.phase))

    c.save()
    c.globalAlpha = Math.max(0, alpha)
    c.fillStyle = p.color
    c.translate(p.x, p.y)
    if (p.kind === 'star') {
      const glow = 1 + 0.35 * Math.sin(now * p.twinkle + p.phase)
      c.rotate(p.rot)
      pathStar4(c, p.size * glow)
      c.fill()
    } else if (p.kind === 'petal') {
      c.rotate(p.rot)
      pathPetal(c, p.size)
      c.fill()
    } else if (p.kind === 'leaf') {
      c.rotate(p.rot + Math.sin(now * 1.4 + p.phase) * 0.35)
      pathLeaf(c, p.size)
      c.fill()
    } else {
      c.beginPath()
      c.arc(0, 0, p.size, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
  }

  // 宙主题：偶发流星
  if (settings.themeId === 'sora') {
    if (!shooting && t >= nextShootingAt) {
      shooting = { x: rand(w * 0.2, w), y: rand(-20, h * 0.25), vx: -rand(320, 520), vy: rand(160, 260), life: 0, max: rand(0.7, 1.1) }
      nextShootingAt = t + rand(6000, 14000)
    }
    if (shooting) {
      shooting.life += dt
      shooting.x += shooting.vx * dt
      shooting.y += shooting.vy * dt
      const fade = 1 - shooting.life / shooting.max
      if (fade <= 0) {
        shooting = null
      } else {
        const tail = 90
        const gx = shooting.x - (shooting.vx / Math.hypot(shooting.vx, shooting.vy)) * tail
        const gy = shooting.y - (shooting.vy / Math.hypot(shooting.vx, shooting.vy)) * tail
        const grad = c.createLinearGradient(shooting.x, shooting.y, gx, gy)
        grad.addColorStop(0, `rgba(232,232,255,${0.85 * fade})`)
        grad.addColorStop(1, 'rgba(195,155,255,0)')
        c.save()
        c.globalAlpha = 1
        c.strokeStyle = grad
        c.lineWidth = 1.6
        c.beginPath()
        c.moveTo(shooting.x, shooting.y)
        c.lineTo(gx, gy)
        c.stroke()
        c.restore()
      }
    }
  }

  raf = requestAnimationFrame(frame)
}

// ---------- 生命周期 ----------

function resize() {
  const cv = canvasEl.value
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  w = cv.clientWidth
  h = cv.clientHeight
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function start() {
  if (running) return
  running = true
  lastT = performance.now()
  raf = requestAnimationFrame(frame)
}

function stop() {
  running = false
  cancelAnimationFrame(raf)
}

function onVisibility() {
  if (document.hidden) stop()
  else start()
}

onMounted(() => {
  const cv = canvasEl.value
  if (!cv) return
  ctx = cv.getContext('2d')
  resize()
  rebuild()
  start()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVisibility)
})

// 主题切换 → 换一套粒子
watch(() => settings.themeId, () => {
  if (!ctx) return
  rebuild()
})
</script>

<template>
  <canvas ref="canvasEl" class="k-effects" aria-hidden="true" />
</template>

<style scoped>
.k-effects {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1;
  pointer-events: none;
}
</style>
