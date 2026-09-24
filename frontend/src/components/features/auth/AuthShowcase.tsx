/**
 * 登录页第一层的视觉件：深色背景、模型球、轮换文案、模型介绍轮播。
 * 模型数据来自 authModels.ts（由仓库内置模型清单生成），不是装饰用的假数据。
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils/cn'
import { modelService } from '@/lib/api/services/models'
import { CHAT_MODEL_CATALOG } from '@/components/admin/settings/chatModelCatalog'
import { FALLBACK_MODELS, pickSpotlightModels, type ShowcaseModel } from './authModels'
import {
  CATALOG_VENDOR_TO_KEY,
  VENDOR_ICON,
  VENDOR_MONOGRAM,
  vendorKeyForProvider,
} from './showcaseVendors'

const VERB_INTERVAL_MS = 2800
/** 占位与可见文字必须用完全相同的字号，否则 bg-clip-text 会把溢出部分裁没 */
const VERB_TEXT_CLASS = 'text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl'
const SPOTLIGHT_INTERVAL_MS = 4200

type Orbit3D = {
  /** 轨道半径占球体半径的比例 */
  radius: number
  /** 轨道面倾角（度）：0 = 正对屏幕的正圆，越接近 90 投影越扁 */
  tilt: number
  /** 轨道在屏幕上的朝向（度） */
  heading: number
  periodSeconds: number
  direction: 1 | -1
  count: number
}

/**
 * 3D 不规则环绕：5 条倾角、朝向、半径、速度各不相同的轨道互相穿插。
 *
 * 旧版用 CSS rotateX 倾斜整条轨道，图标会被拍平压扁（见 docs「不做 3D 倾斜」）。
 * 这版改由 JS 逐帧算 3D 坐标、只取正交投影的屏幕位置，图标本身永远正对屏幕；
 * 深度 z 只用来决定大小、亮度和前后遮挡。
 *
 * 最大半径 0.95：正交投影下屏幕距离不超过半径，外沿不出球体容器，高度预算与旧版一致。
 * 图标总数仍是 14（3+3+3+3+2）。
 */
const ORBITS_3D: Orbit3D[] = [
  { radius: 0.62, tilt: 66, heading: -18, periodSeconds: 38, direction: 1, count: 3 },
  { radius: 0.74, tilt: 52, heading: 38, periodSeconds: 50, direction: -1, count: 3 },
  { radius: 0.86, tilt: 74, heading: 102, periodSeconds: 58, direction: 1, count: 3 },
  { radius: 0.95, tilt: 38, heading: -62, periodSeconds: 70, direction: -1, count: 3 },
  { radius: 0.68, tilt: 22, heading: 12, periodSeconds: 46, direction: 1, count: 2 },
]

/** 图标基准边长；实际显示按深度缩放到 0.72–1.1 倍（约 42–64px） */
const ORBIT_TILE_SIZE = 58
/** 球心文案块的半宽 / 半高（px），图标进入这块区域时淡出，避免压字 */
const CENTER_COPY_HALF_WIDTH = 150
const CENTER_COPY_HALF_HEIGHT = 72

/** 内置文本模型：每家厂商取清单里的第一个（即最新的那个） */
function catalogVendorModels(takenVendors?: Set<string>): ShowcaseModel[] {
  const seen = new Set<string>(takenVendors)
  const out: ShowcaseModel[] = []

  for (const group of CHAT_MODEL_CATALOG) {
    const key = CATALOG_VENDOR_TO_KEY[group.vendor] ?? group.vendor
    if (seen.has(key)) continue
    seen.add(key)

    const newest = group.models[0]
    if (!newest) continue

    out.push({
      name: newest.name,
      type: 'chat',
      icon: VENDOR_ICON[key] ?? '',
      monogram: VENDOR_MONOGRAM[key] ?? group.vendor.slice(0, 2).toUpperCase(),
      vendorKey: key,
      desc: null,
    })
  }

  return out
}

/**
 * 登录页展示的模型。
 *
 * 图片/视频取自 GET /models（免登录可访问），保证和这台机器上真实启用的一致；
 * 文本取自内置清单 —— 文本模型要用户添加后才进库，但接口是内置支持的。
 *
 * 一家厂商只留一个、取最新的那个（sortOrder 最小）：
 * 否则 Seedance 2.0/2.5、三个 NanoBanana 会显示成一排相同图标。
 * 同一张图标文件也只留一次（qwen.svg 和 wanx.svg 在仓库里是同一个文件）。
 */
export function useShowcaseModels() {
  const [models, setModels] = useState<ShowcaseModel[]>(() => mergeShowcase(FALLBACK_MODELS))

  useEffect(() => {
    let cancelled = false

    modelService
      .getModels()
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return

        const media = list
          .filter((model) => model.isActive && (model.type === 'image' || model.type === 'video'))
          .slice()
          .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
          .map<ShowcaseModel>((model) => {
            const vendorKey = vendorKeyForProvider(model.provider)
            return {
              name: model.name,
              type: model.type as 'image' | 'video',
              // 产品图标优先：它们是彩色的。重复文件（qwen.svg 与 wanx.svg 相同）
              // 已经由厂商归并解决 —— 同一家只会留下一个，不会并排出现两个相同图标。
              icon: model.icon || VENDOR_ICON[vendorKey] || '',
              vendorKey,
              desc: model.description || null,
            }
          })
          .filter((model) => model.icon)

        if (media.length === 0) return
        setModels(mergeShowcase(media))
      })
      .catch(() => {
        // 后端没起来就用兜底，登录页不该因此空掉
      })

    return () => {
      cancelled = true
    }
  }, [])

  return models
}

/**
 * 图文视频（来自 /models）+ 文本（来自内置清单）拼成一份，跨两个列表只留一家一个。
 * 必须跨列表去重：阿里在图像侧是万相、文本侧是 Qwen，两边都挂 Qwen 的标，
 * 各自去重的话球上会出现两个一模一样的紫色图标。
 */
function mergeShowcase(media: ShowcaseModel[]): ShowcaseModel[] {
  const primary = dedupeByVendor(media)
  const taken = new Set(primary.map((model) => model.vendorKey ?? model.name))
  return [...primary, ...catalogVendorModels(taken)]
}

/** 按厂商取第一个（调用方已按 sortOrder 排过），再按图标文件去一次重 */
function dedupeByVendor(models: ShowcaseModel[]): ShowcaseModel[] {
  const seenVendor = new Set<string>()
  const seenIcon = new Set<string>()
  const out: ShowcaseModel[] = []

  for (const model of models) {
    const vendor = model.vendorKey ?? model.name
    if (seenVendor.has(vendor)) continue
    if (model.icon && seenIcon.has(model.icon)) continue
    seenVendor.add(vendor)
    if (model.icon) seenIcon.add(model.icon)
    out.push(model)
  }

  return out
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 每 intervalMs 前进一位；开启「减弱动态效果」时停在第一项 */
function useCycle(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (length <= 1 || prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [length, intervalMs])

  return index
}

export function AuthBackdrop() {
  return (
    <div className="auth-aurora" aria-hidden="true">
      <div className="auth-grid" />
      <div className="auth-aurora-band auth-aurora-band-1" />
      <div className="auth-aurora-band auth-aurora-band-2" />
      <div className="auth-aurora-band auth-aurora-band-3" />
    </div>
  )
}

export function AuthVerbCycle({
  prefix,
  verbs,
  notes,
}: {
  prefix: string
  verbs: string[]
  notes?: string[]
}) {
  const index = useCycle(verbs.length, VERB_INTERVAL_MS)
  const note = notes?.length ? notes[index % notes.length] : null

  // 用最长的词撑住高度与宽度，避免轮换时整块上下跳动
  const widest = useMemo(
    () => verbs.reduce((longest, verb) => (verb.length > longest.length ? verb : longest), ''),
    [verbs],
  )

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm font-medium tracking-[0.2em] text-white/60">{prefix}</p>

      {/*
        两个 span 叠在同一个网格格子里，格子会自动取两者中更大的尺寸。
        之前占位用 sm:text-5xl 而可见字用 lg:text-6xl，大屏上可见字比格子宽 25%，
        又因为 bg-clip-text 只在元素盒子内绘制背景，溢出的字直接变透明消失。
        所以两边字号必须完全一致，且不能用 absolute 把可见字锁死在占位尺寸上。
      */}
      <span className="inline-grid">
        <span
          aria-hidden="true"
          className={cn('invisible whitespace-nowrap', VERB_TEXT_CLASS)}
          style={{ gridArea: '1 / 1' }}
        >
          {widest}
        </span>
        <span
          key={index}
          className={cn(
            'auth-fade-in whitespace-nowrap bg-gradient-to-b from-white to-white/75 bg-clip-text text-transparent',
            VERB_TEXT_CLASS,
          )}
          style={{ gridArea: '1 / 1' }}
        >
          {verbs[index]}
        </span>
        <span className="sr-only">{verbs.join('、')}</span>
      </span>

      {note ? (
        <p key={`note-${index}`} className="auth-fade-in max-w-[300px] text-xs leading-5 text-white/55">
          {note}
        </p>
      ) : null}
    </div>
  )
}

/** 左右两侧轮播的模型介绍卡 */
export function ModelSpotlight({
  models,
  offset,
  typeLabels,
  modelWord,
  align,
}: {
  models: ShowcaseModel[]
  offset: number
  typeLabels: { image: string; video: string; chat: string }
  modelWord: string
  align: 'left' | 'right'
}) {
  const spotlight = useMemo(() => pickSpotlightModels(models), [models])
  const index = useCycle(spotlight.length, SPOTLIGHT_INTERVAL_MS)
  const model = spotlight.length > 0 ? spotlight[(index + offset) % spotlight.length] : null

  if (!model) return null

  return (
    <div
      key={`${model.name}-${align}`}
      className={cn(
        'auth-fade-in flex w-[220px] flex-col gap-3',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white">
        {model.icon ? (
          <img src={model.icon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
        ) : (
          <span className="text-sm font-bold tracking-tight text-stone-700">{model.monogram}</span>
        )}
      </span>

      <p className="text-[11px] tracking-[0.18em] text-white/40">
        {typeLabels[model.type] ?? modelWord} / {modelWord}
      </p>

      <p className="text-base font-semibold text-white/90">{model.name}</p>

      <p className="text-xs leading-5 text-white/45">{model.desc}</p>
    </div>
  )
}

/** 模型球：几条不同倾角的轨道交叉，图标沿轨道环绕并始终正面朝向用户 */
type OrbitItem = {
  model: ShowcaseModel
  orbit: Orbit3D
  phase: number
}

/** DOM 版：WebGL 不可用、移动端、减弱动态效果、或 3D 场景初始化失败时的兜底 */
function ModelGlobeDom({ label, models }: { label: string; models: ShowcaseModel[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const hoveredRef = useRef(false)

  const items = useMemo<OrbitItem[]>(() => {
    if (models.length === 0) return []
    const out: OrbitItem[] = []
    let cursor = 0
    ORBITS_3D.forEach((orbit, orbitIndex) => {
      for (let i = 0; i < orbit.count; i += 1) {
        out.push({
          model: models[cursor % models.length],
          orbit,
          // 同轨均分，再按轨道错开，避免几条轨道的图标同时挤到一处
          phase: (Math.PI * 2 * i) / orbit.count + orbitIndex * 0.9,
        })
        cursor += 1
      }
    })
    return out
  }, [models])

  useEffect(() => {
    const container = containerRef.current
    if (!container || items.length === 0) return

    let halfSize = container.clientWidth / 2
    const observer = new ResizeObserver(() => {
      halfSize = container.clientWidth / 2
    })
    observer.observe(container)

    const lastZ: number[] = []
    let elapsed = 0
    let speed = 1
    let lastTime = performance.now()
    let frame = 0

    const render = () => {
      items.forEach((item, index) => {
        const el = itemRefs.current[index]
        if (!el) return
        const { orbit } = item
        const theta = item.phase + (orbit.direction * Math.PI * 2 * elapsed) / orbit.periodSeconds
        const tilt = (orbit.tilt * Math.PI) / 180
        const heading = (orbit.heading * Math.PI) / 180

        // 轨道面内的圆 → 绕 x 轴倾斜 → 绕屏幕法线转到 heading 方向
        const px = Math.cos(theta)
        const py = Math.sin(theta) * Math.cos(tilt)
        const pz = Math.sin(theta) * Math.sin(tilt)
        const x = (px * Math.cos(heading) - py * Math.sin(heading)) * orbit.radius * halfSize
        const y = (px * Math.sin(heading) + py * Math.cos(heading)) * orbit.radius * halfSize
        const depth = (pz * orbit.radius + 1) / 2 // 0 = 最远，1 = 最近

        const scale = 0.72 + 0.38 * depth
        let opacity = 0.35 + 0.65 * depth

        // 进入球心文案区域就淡出，边缘 28px 做软过渡
        const tileHalf = (ORBIT_TILE_SIZE * scale) / 2
        const overX = Math.abs(x) - (CENTER_COPY_HALF_WIDTH + tileHalf)
        const overY = Math.abs(y) - (CENTER_COPY_HALF_HEIGHT + tileHalf)
        const outside = Math.max(overX, overY)
        if (outside < 28) opacity *= 0.15 + 0.85 * Math.max(0, outside / 28)

        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
        el.style.opacity = opacity.toFixed(3)

        // 前后遮挡：只在层级真的变化时写，避免每帧触发重新分层
        const z = 1 + Math.round(depth * 18)
        if (lastZ[index] !== z) {
          lastZ[index] = z
          el.style.zIndex = String(z)
        }
      })
    }

    if (prefersReducedMotion()) {
      render()
      return () => observer.disconnect()
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now
      // 悬停时平滑减速到停，方便看清图标；移开后再平滑恢复
      speed += ((hoveredRef.current ? 0 : 1) - speed) * 0.08
      elapsed += dt * speed
      render()
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [items])

  return (
    <div ref={containerRef} className="auth-globe" role="img" aria-label={label}>
      <div className="auth-globe-core" />

      <span className="auth-globe-glow absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/25 blur-3xl" />

      {/* 轨道线就是图标实际走的路径（倾斜圆的正交投影 = 椭圆），静态 SVG，不参与动画 */}
      <svg className="auth-orbit3d-paths" viewBox="-1 -1 2 2" aria-hidden="true">
        {ORBITS_3D.map((orbit) => (
          <ellipse
            key={`${orbit.radius}-${orbit.heading}`}
            cx={0}
            cy={0}
            rx={orbit.radius}
            ry={orbit.radius * Math.abs(Math.cos((orbit.tilt * Math.PI) / 180))}
            transform={`rotate(${orbit.heading})`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {items.map((item, index) => (
        <div
          key={`${item.model.name}-${index}`}
          ref={(el) => {
            itemRefs.current[index] = el
          }}
          className="auth-orbit3d-item"
        >
          <div className="flex flex-col items-center gap-1.5">
            {/* 不用 backdrop-blur：移动元素上的 backdrop-filter 是最主要的掉帧来源 */}
            <span
              className="auth-orbit-tile flex items-center justify-center rounded-2xl border border-white/25 bg-white"
              style={{ width: ORBIT_TILE_SIZE, height: ORBIT_TILE_SIZE }}
              title={item.model.name}
              onMouseEnter={() => {
                hoveredRef.current = true
              }}
              onMouseLeave={() => {
                hoveredRef.current = false
              }}
            >
              {item.model.icon ? (
                <img
                  src={item.model.icon}
                  alt=""
                  aria-hidden="true"
                  className="object-contain"
                  style={{ width: ORBIT_TILE_SIZE * 0.52, height: ORBIT_TILE_SIZE * 0.52 }}
                  loading="lazy"
                />
              ) : (
                <span className="font-bold tracking-tight text-stone-700" style={{ fontSize: ORBIT_TILE_SIZE * 0.3 }}>
                  {item.model.monogram}
                </span>
              )}
            </span>
            <span className="max-w-[112px] truncate whitespace-nowrap text-[10px] font-medium text-white/50">
              {item.model.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 3D 场景里展示的模型数量上限：再多节点会挤在一起 */
const GLOBE_NODE_LIMIT = 16

type GlobeMode = 'pending' | 'webgl' | 'dom'

/**
 * 能跑 WebGL 且是桌面端才用 3D 场景；手机、触屏、减弱动态效果、软件渲染一律走 DOM 版。
 * 软件渲染（SwiftShader / llvmpipe 等）下 2 万多个点会把 CPU 打满。
 */
function detectGlobeMode(): GlobeMode {
  if (typeof window === 'undefined') return 'dom'
  if (prefersReducedMotion()) return 'dom'
  const media = window.matchMedia?.bind(window)
  if (media && (media('(max-width: 768px)').matches || media('(pointer: coarse)').matches)) return 'dom'
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return 'dom'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return 'dom'
    return 'webgl'
  } catch {
    return 'dom'
  }
}

export function ModelGlobe({ label, models }: { label: string; models: ShowcaseModel[] }) {
  const [mode, setMode] = useState<GlobeMode>('pending')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMode(detectGlobeMode())
  }, [])

  const nodes = useMemo(
    () =>
      models.slice(0, GLOBE_NODE_LIMIT).map((model) => ({
        name: model.name,
        icon: model.icon || undefined,
        monogram: model.monogram,
      })),
    [models],
  )

  useEffect(() => {
    if (mode !== 'webgl' || nodes.length === 0) return
    const container = containerRef.current
    if (!container) return

    const stage = container.closest('.auth-stage') as HTMLElement | null
    let disposed = false
    let handle: { dispose: () => void } | null = null

    import('./globeScene')
      .then(({ createGlobeScene }) =>
        createGlobeScene({
          container,
          nodes,
          quietHalfWidth: 150,
          quietHalfHeight: 72,
          onHoverChange: (hovered) => {
            if (!stage) return
            if (hovered) stage.dataset.globeHover = 'true'
            else delete stage.dataset.globeHover
          },
          onFatal: () => {
            if (!disposed) setMode('dom')
          },
        }),
      )
      .then((created) => {
        if (disposed) created.dispose()
        else handle = created
      })
      .catch((error) => {
        console.warn('globe scene init failed, falling back to DOM globe', error)
        if (!disposed) setMode('dom')
      })

    return () => {
      disposed = true
      handle?.dispose()
      if (stage) delete stage.dataset.globeHover
    }
  }, [mode, nodes])

  if (mode === 'dom') return <ModelGlobeDom label={label} models={models} />

  return (
    <div ref={containerRef} className="auth-globe" role="img" aria-label={label}>
      <span className="auth-globe-glow absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-3xl" />
    </div>
  )
}
