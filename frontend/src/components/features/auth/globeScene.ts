/**
 * 登录页模型球的 WebGL 版：点阵地球 + 玻璃边缘高光 + 经纬线 + 航线流光 + 贴在球外一层的模型节点。
 *
 * 只由 AuthShowcase 的 ModelGlobe 动态 import，three.js 因此单独成包，不进其它页面。
 * 任何一步初始化失败都抛出，由调用方退回 DOM 版（ModelGlobeDom）。
 *
 * 陆地遮罩 /images/globe/land-mask.png 由 Natural Earth 50m land（公有领域）栅格化生成：
 * 1024×512 等距圆柱投影，白 = 陆地。
 */

import * as THREE from 'three'

export type GlobeNodeInput = {
  name: string
  icon?: string
  monogram?: string
}

export type GlobeSceneOptions = {
  container: HTMLElement
  nodes: GlobeNodeInput[]
  /** 球心文案区（px，相对球体容器中心），里面的一切都要淡出给文字让位 */
  quietHalfWidth: number
  quietHalfHeight: number
  /** 悬停状态变化时回调，用于驱动页面其它层的退让效果 */
  onHoverChange?: (hovered: boolean) => void
  /** 运行中出现致命错误（着色器编译失败、上下文丢失），调用方应退回 DOM 版 */
  onFatal?: () => void
}

export type GlobeSceneHandle = {
  dispose: () => void
}

const LAND_MASK_SRC = '/images/globe/land-mask.png'
const POINT_COUNT = 24000
/** 节点所在的外壳半径（地球半径 = 1） */
const NODE_SHELL = 1.17
const NODE_WORLD_SIZE = 0.2
const CAMERA_DISTANCE = 4.9
const CAMERA_FOV = 30
const SPIN_SPEED = 0.07 // rad/s
const HOVER_SCALE = 1.45

const COLOR_COOL = new THREE.Color('#8fb0ff')
const COLOR_WARM = new THREE.Color('#b99cff')
const COLOR_SILVER = new THREE.Color('#eef2ff')

/** 航线端点（纬度, 经度） */
const CITIES: [number, number][] = [
  [39.9, 116.4], // 北京
  [31.2, 121.5], // 上海
  [37.8, -122.4], // 旧金山
  [40.7, -74.0], // 纽约
  [51.5, -0.1], // 伦敦
  [1.35, 103.8], // 新加坡
  [-33.9, 151.2], // 悉尼
  [25.2, 55.3], // 迪拜
  [35.7, 139.7], // 东京
  [-23.5, -46.6], // 圣保罗
]
const ROUTES: [number, number][] = [
  [0, 2],
  [1, 4],
  [4, 3],
  [3, 9],
  [1, 5],
  [5, 6],
  [7, 4],
  [8, 2],
]

/** 所有着色器共用的「球心留白」：屏幕上越靠近文案区越透明 */
const QUIET_GLSL = `
uniform vec2 uResolution;
uniform vec2 uQuietHalf;
uniform float uAlpha;
float quiet() {
  vec2 d = abs(gl_FragCoord.xy - uResolution * 0.5) / max(uQuietHalf, vec2(1.0));
  float k = max(d.x, d.y);
  return uAlpha * mix(0.12, 1.0, smoothstep(0.9, 1.35, k));
}
`

function latLonToVec3(lat: number, lon: number, radius = 1) {
  const phi = (lat * Math.PI) / 180
  const theta = (lon * Math.PI) / 180
  return new THREE.Vector3(
    Math.cos(phi) * Math.cos(theta) * radius,
    Math.sin(phi) * radius,
    -Math.cos(phi) * Math.sin(theta) * radius,
  )
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}

/** 把图标画进一张带磨砂底和名字的贴图；深色单色图标反相成浅色，否则在深底上看不见 */
async function buildNodeTexture(node: GlobeNodeInput) {
  const W = 256
  const H = 232
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  const tile = 168
  const tx = (W - tile) / 2
  ctx.fillStyle = 'rgba(22, 26, 44, 0.62)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(tx + 1, 1, tile - 2, tile - 2, 36)
  ctx.fill()
  ctx.stroke()

  let drawn = false
  if (node.icon) {
    try {
      const img = await loadImage(node.icon)
      const size = 96
      const off = document.createElement('canvas')
      off.width = size
      off.height = size
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (octx) {
        octx.drawImage(img, 0, 0, size, size)
        const data = octx.getImageData(0, 0, size, size)
        let lum = 0
        let count = 0
        for (let i = 0; i < data.data.length; i += 4) {
          if (data.data[i + 3] < 100) continue
          lum += (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3
          count += 1
        }
        if (count > 0 && lum / count < 70) {
          for (let i = 0; i < data.data.length; i += 4) {
            data.data[i] = 255 - data.data[i]
            data.data[i + 1] = 255 - data.data[i + 1]
            data.data[i + 2] = 255 - data.data[i + 2]
          }
          octx.putImageData(data, 0, 0)
        }
        ctx.drawImage(off, tx + (tile - size) / 2, (tile - size) / 2, size, size)
        drawn = true
      }
    } catch {
      // 图标加载失败就走字牌
    }
  }
  if (!drawn) {
    const text = (node.monogram || node.name || 'AI').trim().slice(0, 3).toUpperCase()
    ctx.fillStyle = 'rgba(238, 242, 255, 0.92)'
    ctx.font = '600 60px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, W / 2, tile / 2 + 2)
  }

  ctx.fillStyle = 'rgba(238, 242, 255, 0.72)'
  ctx.font = '500 30px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let label = node.name
  while (ctx.measureText(label).width > W - 8 && label.length > 2) label = label.slice(0, -1)
  if (label !== node.name) label = `${label.slice(0, -1)}…`
  ctx.fillText(label, W / 2, tile + 34)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 2
  return { texture, aspect: H / W }
}

export async function createGlobeScene(options: GlobeSceneOptions): Promise<GlobeSceneHandle> {
  const { container, nodes, onHoverChange, onFatal } = options
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item)
    return item
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.className = 'auth-globe-canvas'
  container.appendChild(renderer.domElement)

  // 着色器编译失败时 three 只打日志、画面一片空白 —— 必须接住并退回 DOM 版
  let fatal = false
  const fail = () => {
    if (fatal) return
    fatal = true
    onFatal?.()
  }
  renderer.debug.onShaderError = () => fail()
  renderer.domElement.addEventListener('webglcontextlost', fail)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50)
  camera.position.set(0, 0, CAMERA_DISTANCE)

  // tilt 负责固定的地轴倾斜 + 鼠标视差，world 负责自转
  const tilt = new THREE.Group()
  tilt.rotation.set(0.32, 0, -0.18)
  scene.add(tilt)
  const world = new THREE.Group()
  tilt.add(world)

  const shared = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uQuietHalf: { value: new THREE.Vector2(options.quietHalfWidth, options.quietHalfHeight) },
    uAlpha: { value: 0 },
    uTime: { value: 0 },
    uPointSize: { value: 2.0 * pixelRatio },
    uCool: { value: COLOR_COOL },
    uWarm: { value: COLOR_WARM },
    uSilver: { value: COLOR_SILVER },
  }

  // 1. 玻璃球：只画边缘（菲涅尔），中间几乎透明，冷暖两侧渐变
  const rim = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, 72, 48)),
    track(
      new THREE.ShaderMaterial({
        uniforms: shared,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec3 vNormal; varying vec3 vView;
          void main() {
            vec4 p = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-p.xyz);
            gl_Position = projectionMatrix * p;
          }`,
        fragmentShader: `
          varying vec3 vNormal; varying vec3 vView;
          uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uSilver;
          ${QUIET_GLSL}
          void main() {
            float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
            float side = smoothstep(-0.4, 0.9, vNormal.x - vNormal.y * 0.6);
            vec3 c = mix(mix(uCool, uWarm, side), uSilver, pow(f, 8.0));
            float a = 0.55 * pow(f, 5.0) + 0.03 * pow(f, 1.5);
            gl_FragColor = vec4(c, a * quiet());
          }`,
      }),
    ),
  )
  rim.renderOrder = 1
  world.add(rim)

  // 2. 经纬线：背面几乎看不见，正面淡淡一层
  const lineMaterial = track(
    new THREE.ShaderMaterial({
      uniforms: shared,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying float vFacing;
        void main() {
          vFacing = normalize(normalMatrix * normalize(position)).z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vFacing;
        uniform vec3 uCool; uniform vec3 uSilver;
        ${QUIET_GLSL}
        void main() {
          gl_FragColor = vec4(mix(uCool, uSilver, 0.6), mix(0.01, 0.075, smoothstep(-0.1, 0.9, vFacing)) * quiet());
        }`,
    }),
  )
  const addLoop = (points: THREE.Vector3[]) => {
    const line = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(points)), lineMaterial)
    line.renderOrder = 2
    world.add(line)
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    addLoop(Array.from({ length: 160 }, (_, i) => latLonToVec3(lat, (i / 160) * 360 - 180, 1.001)))
  }
  // 经线：过两极的大圆，6 条覆盖 12 个经度
  for (let m = 0; m < 6; m += 1) {
    const equator = latLonToVec3(0, (m / 6) * 180)
    addLoop(
      Array.from({ length: 160 }, (_, i) => {
        const a = (i / 160) * Math.PI * 2
        return equator
          .clone()
          .multiplyScalar(Math.cos(a) * 1.001)
          .add(new THREE.Vector3(0, Math.sin(a) * 1.001, 0))
      }),
    )
  }

  // 3. 外圈倾斜轨道环（装饰，不跟地球自转）
  const ring = new THREE.LineLoop(
    track(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 256 }, (_, i) => {
          const a = (i / 256) * Math.PI * 2
          return new THREE.Vector3(Math.cos(a) * 1.42, 0, Math.sin(a) * 1.42)
        }),
      ),
    ),
    lineMaterial,
  )
  ring.rotation.set(1.18, 0, 0.42)
  tilt.add(ring)

  // 4. 航线：大圆弧抬离地表，彗星拖尾沿弧线跑
  {
    const positions: number[] = []
    const progress: number[] = []
    const routeIds: number[] = []
    ROUTES.forEach(([a, b], routeIndex) => {
      const p0 = latLonToVec3(...CITIES[a])
      const p1 = latLonToVec3(...CITIES[b])
      const omega = p0.angleTo(p1)
      const steps = 80
      const at = (t: number) => {
        const s = Math.sin(omega)
        const v = p0
          .clone()
          .multiplyScalar(Math.sin((1 - t) * omega) / s)
          .addScaledVector(p1, Math.sin(t * omega) / s)
        return v.multiplyScalar(1.01 + 0.16 * Math.sin(Math.PI * t) * Math.min(1, omega))
      }
      for (let i = 0; i < steps; i += 1) {
        for (const t of [i / steps, (i + 1) / steps]) {
          const v = at(t)
          positions.push(v.x, v.y, v.z)
          progress.push(t)
          routeIds.push(routeIndex)
        }
      }
    })
    const geometry = track(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('progress', new THREE.Float32BufferAttribute(progress, 1))
    geometry.setAttribute('routeId', new THREE.Float32BufferAttribute(routeIds, 1))
    const routes = new THREE.LineSegments(
      geometry,
      track(
        new THREE.ShaderMaterial({
          uniforms: shared,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: `
            attribute float progress; attribute float routeId;
            varying float vProgress; varying float vRoute; varying float vFacing;
            void main() {
              vProgress = progress; vRoute = routeId;
              vFacing = normalize(normalMatrix * normalize(position)).z;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: `
            varying float vProgress; varying float vRoute; varying float vFacing;
            uniform float uTime; uniform vec3 uCool; uniform vec3 uSilver;
            ${QUIET_GLSL}
            void main() {
              float head = fract(uTime * 0.16 + vRoute * 0.29);
              float d = head - vProgress;
              float trail = d >= 0.0 ? pow(1.0 - clamp(d / 0.22, 0.0, 1.0), 3.0) : 0.0;
              float ends = smoothstep(0.0, 0.06, vProgress) * (1.0 - smoothstep(0.94, 1.0, vProgress));
              float a = (0.05 + trail * 0.85) * ends * mix(0.06, 1.0, smoothstep(-0.2, 0.6, vFacing));
              gl_FragColor = vec4(mix(uCool, uSilver, trail), a * quiet());
            }`,
        }),
      ),
    )
    routes.renderOrder = 4
    world.add(routes)
  }

  // 5. 点阵地球：斐波那契球面均匀撒点，陆地保留、海洋稀疏保留一点底纹
  loadImage(LAND_MASK_SRC)
    .then((img) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 512
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 1024, 512)
      const mask = ctx.getImageData(0, 0, 1024, 512).data
      const positions: number[] = []
      const weights: number[] = []
      const golden = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < POINT_COUNT; i += 1) {
        const y = 1 - (2 * (i + 0.5)) / POINT_COUNT
        const r = Math.sqrt(1 - y * y)
        const theta = i * golden
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        const lat = Math.asin(y)
        const lon = Math.atan2(-z, x)
        const px = Math.min(1023, Math.floor(((lon / (Math.PI * 2) + 0.5) % 1) * 1024))
        const py = Math.min(511, Math.floor((0.5 - lat / Math.PI) * 512))
        const isLand = mask[(py * 1024 + px) * 4] > 127
        if (!isLand && i % 17 !== 0) continue
        positions.push(x * 1.003, y * 1.003, z * 1.003)
        weights.push(isLand ? 1 : 0.14)
      }
      const geometry = track(new THREE.BufferGeometry())
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('weight', new THREE.Float32BufferAttribute(weights, 1))
      const points = new THREE.Points(
        geometry,
        track(
          new THREE.ShaderMaterial({
            uniforms: shared,
            transparent: true,
            depthWrite: false,
            vertexShader: `
              attribute float weight; uniform float uPointSize;
              varying float vFacing; varying float vWeight;
              void main() {
                vFacing = normalize(normalMatrix * normalize(position)).z;
                vWeight = weight;
                gl_PointSize = uPointSize;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }`,
            fragmentShader: `
              varying float vFacing; varying float vWeight;
              uniform vec3 uCool; uniform vec3 uSilver;
              ${QUIET_GLSL}
              void main() {
                float m = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
                float a = mix(0.02, 0.62, smoothstep(-0.15, 0.85, vFacing)) * vWeight * m;
                gl_FragColor = vec4(mix(uCool, uSilver, 0.62), a * quiet());
              }`,
          }),
        ),
      )
      points.renderOrder = 3
      world.add(points)
    })
    .catch(() => {
      // 没有遮罩就只显示球、经纬线和航线，不影响节点
    })

  // 6. 模型节点：斐波那契分布在外壳上，跟着地球一起转
  type NodeState = {
    sprite: THREE.Sprite
    material: THREE.SpriteMaterial
    aspect: number
    local: THREE.Vector3
    hover: number
    screen: THREE.Vector2
    radiusPx: number
    visible: number
  }
  const nodeStates: NodeState[] = []
  const nodeCount = nodes.length
  const golden = Math.PI * (3 - Math.sqrt(5))
  nodes.forEach((node, index) => {
    const y = 1 - (2 * (index + 0.5)) / Math.max(1, nodeCount)
    // 避开两极，节点集中在中纬度，转起来才看得见
    const yy = y * 0.82
    const r = Math.sqrt(1 - yy * yy)
    const theta = index * golden
    const local = new THREE.Vector3(Math.cos(theta) * r, yy, Math.sin(theta) * r).multiplyScalar(NODE_SHELL)
    const material = track(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
    )
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(local)
    sprite.renderOrder = 10
    sprite.scale.set(NODE_WORLD_SIZE, NODE_WORLD_SIZE, 1)
    world.add(sprite)
    const state: NodeState = {
      sprite,
      material,
      aspect: 1,
      local,
      hover: 0,
      screen: new THREE.Vector2(),
      radiusPx: 0,
      visible: 0,
    }
    nodeStates.push(state)
    buildNodeTexture(node)
      .then(({ texture, aspect }) => {
        track(texture)
        material.map = texture
        material.needsUpdate = true
        state.aspect = aspect
      })
      .catch(() => {})
  })

  // 尺寸
  let size = { w: 1, h: 1 }
  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    size = { w, h }
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    shared.uResolution.value.set(w * pixelRatio, h * pixelRatio)
    shared.uQuietHalf.value.set(options.quietHalfWidth * pixelRatio, options.quietHalfHeight * pixelRatio)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  // 鼠标：视差 + 悬停命中（在屏幕空间里比距离，不用射线）
  const pointer = { x: 0, y: 0, inside: false, px: -9999, py: -9999 }
  const onPointerMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect()
    pointer.px = event.clientX - rect.left
    pointer.py = event.clientY - rect.top
    pointer.inside = pointer.px >= 0 && pointer.py >= 0 && pointer.px <= rect.width && pointer.py <= rect.height
    pointer.x = (pointer.px / rect.width) * 2 - 1
    pointer.y = (pointer.py / rect.height) * 2 - 1
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  let hoveredIndex = -1
  let frame = 0
  let last = performance.now()
  let elapsed = 0
  let spin = 1
  const worldPos = new THREE.Vector3()
  const viewPos = new THREE.Vector3()

  const render = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    elapsed += dt
    shared.uTime.value = elapsed
    shared.uAlpha.value = Math.min(1, shared.uAlpha.value + dt / 1.4)

    spin += ((hoveredIndex >= 0 ? 0 : 1) - spin) * 0.08
    world.rotation.y += SPIN_SPEED * dt * spin
    // 轻微视差：鼠标带着整个球偏一点，停下就回正
    const targetX = 0.32 + (pointer.inside ? pointer.y * 0.08 : 0)
    const targetY = pointer.inside ? pointer.x * 0.12 : 0
    tilt.rotation.x += (targetX - tilt.rotation.x) * 0.05
    tilt.rotation.y += (targetY - tilt.rotation.y) * 0.05

    scene.updateMatrixWorld()

    // 节点：按朝向决定亮度和大小，按屏幕位置决定是否给文案让位
    let nearest = -1
    let nearestDist = Infinity
    nodeStates.forEach((state, index) => {
      state.sprite.getWorldPosition(worldPos)
      viewPos.copy(worldPos).applyMatrix4(camera.matrixWorldInverse)
      const facing = worldPos.clone().normalize().dot(camera.position.clone().normalize())
      const front = THREE.MathUtils.smoothstep(facing, -0.35, 0.55)
      worldPos.project(camera)
      const sx = (worldPos.x * 0.5 + 0.5) * size.w
      const sy = (-worldPos.y * 0.5 + 0.5) * size.h
      state.screen.set(sx, sy)

      const scale = NODE_WORLD_SIZE * (0.72 + 0.38 * front)
      const pxPerUnit = size.h / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * -viewPos.z)
      state.radiusPx = (scale * pxPerUnit) / 2

      const dx = Math.abs(sx - size.w / 2) - (options.quietHalfWidth + state.radiusPx)
      const dy = Math.abs(sy - size.h / 2) - (options.quietHalfHeight + state.radiusPx)
      const outside = Math.max(dx, dy)
      const quiet = outside < 28 ? 0.12 + 0.88 * Math.max(0, outside / 28) : 1
      state.visible = front * quiet

      if (pointer.inside && state.visible > 0.35) {
        const dist = Math.hypot(pointer.px - sx, pointer.py - (sy - state.radiusPx * 0.15))
        if (dist < state.radiusPx * 0.62 && dist < nearestDist) {
          nearest = index
          nearestDist = dist
        }
      }
    })

    if (nearest !== hoveredIndex) {
      hoveredIndex = nearest
      onHoverChange?.(nearest >= 0)
    }

    nodeStates.forEach((state, index) => {
      const target = index === hoveredIndex ? 1 : 0
      state.hover += (target - state.hover) * 0.25
      const front = state.visible
      const base = NODE_WORLD_SIZE * (0.72 + 0.38 * Math.min(1, front + state.hover))
      const s = base * (1 + (HOVER_SCALE - 1) * state.hover)
      state.sprite.scale.set(s, s * state.aspect, 1)
      const dim = hoveredIndex >= 0 && index !== hoveredIndex ? 0.4 : 1
      const opacity = Math.max(state.hover, (0.12 + 0.88 * front) * dim) * shared.uAlpha.value
      state.material.opacity = state.material.map ? opacity : 0
      state.sprite.renderOrder = index === hoveredIndex ? 20 : 10
    })

    renderer.render(scene, camera)
    frame = window.requestAnimationFrame(render)
  }

  // 上下文拿不到就视为失败，由调用方退回 DOM 版（必须在启动循环之前判断）
  const gl = renderer.getContext()
  if (!gl || gl.isContextLost()) {
    observer.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    renderer.dispose()
    renderer.domElement.remove()
    throw new Error('webgl context unavailable')
  }
  // 先同步编译一遍，着色器有错能在第一帧前就发现
  renderer.compile(scene, camera)
  if (fatal) {
    observer.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    renderer.dispose()
    renderer.domElement.remove()
    throw new Error('globe shader compile failed')
  }
  frame = window.requestAnimationFrame(render)

  return {
    dispose: () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('webglcontextlost', fail)
      observer.disconnect()
      if (hoveredIndex >= 0) onHoverChange?.(false)
      disposables.forEach((item) => item.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
