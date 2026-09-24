/**
 * 工作流预设（照参考站 canvas-v2 的模板）。
 *
 * 每个预设就是一小张预先连好的节点图，点一下铺到画布上，用户改提示词就能跑。
 * 节点 id 在这里用占位符（`ref`），铺进画布时由 store 重新编号（见 applyPreset）。
 *
 * **这里不存文案**：预设名、说明、每个节点的标题、种子提示词全在
 * canvas.presets.<预设 key>.{name,description,nodes.<ref>,prompts.<ref>}。
 * 铺开时按当前语言写进节点——标题是用户接着要改的具体名字，不是节点类型名，
 * 所以铺下去就定住，之后切语言不会把用户改过的标题冲掉。
 */

import type { CanvasNodeKind } from '../canvasV2.types'

export type PresetNode = {
  /** 预设内部的临时 id，同时也是标题 / 种子提示词的 i18n key */
  ref: string
  kind: CanvasNodeKind
  position: { x: number; y: number }
  /** 这个节点带种子提示词，文案在 canvas.presets.<key>.prompts.<ref> */
  seedPrompt?: boolean
  data?: Record<string, unknown>
}

export type PresetEdge = { from: string; to: string }

export type CanvasPreset = {
  key: string
  nodes: PresetNode[]
  edges: PresetEdge[]
}

const COL = 380
const ROW = 300

export const CANVAS_PRESETS: CanvasPreset[] = [
  {
    key: 'character-design',
    nodes: [
      { ref: 'desc', kind: 'text', position: { x: 0, y: 0 }, data: { text: '' } },
      {
        ref: 'base',
        kind: 'imageGenerator',
        position: { x: COL, y: 0 },
        data: { aspectRatio: '3:4', angleKeys: ['front'], shotSizeKey: 'medium' },
      },
      {
        ref: 'angles',
        kind: 'imageGenerator',
        position: { x: COL * 2, y: 0 },
        seedPrompt: true,
        data: {
          aspectRatio: '3:4',
          angleKeys: ['front', 'three-quarter-left', 'left', 'back'],
          snippetIds: ['b-photoreal', 'b-detail'],
        },
      },
    ],
    edges: [
      { from: 'desc', to: 'base' },
      { from: 'base', to: 'angles' },
    ],
  },
  {
    key: 'multi-angle-storyboard',
    nodes: [
      { ref: 'src', kind: 'image', position: { x: 0, y: 0 } },
      {
        ref: 'gen',
        kind: 'imageGenerator',
        position: { x: COL, y: 0 },
        seedPrompt: true,
        data: { angleKeys: ['front', 'left', 'back', 'top-down'] },
      },
    ],
    edges: [{ from: 'src', to: 'gen' }],
  },
  {
    key: 'keyframe-video',
    nodes: [
      { ref: 'start', kind: 'imageGenerator', position: { x: 0, y: 0 }, data: { aspectRatio: '16:9' } },
      {
        ref: 'video',
        kind: 'videoGenerator',
        position: { x: COL, y: 0 },
        data: { aspectRatio: '16:9', durationSeconds: 5, snippetIds: ['b-cam-push'] },
      },
      { ref: 'clip', kind: 'video', position: { x: COL * 2, y: 0 } },
    ],
    edges: [
      { from: 'start', to: 'video' },
      { from: 'video', to: 'clip' },
    ],
  },
  {
    key: 'picture-book',
    nodes: [
      { ref: 'director', kind: 'director', position: { x: 0, y: 0 } },
      { ref: 'script', kind: 'script', position: { x: COL, y: 0 } },
      {
        ref: 'style',
        kind: 'promptGroup',
        position: { x: COL, y: ROW },
        data: { snippetIds: ['b-watercolor', 'b-cozy'] },
      },
      { ref: 'gen', kind: 'imageGenerator', position: { x: COL * 2, y: 0 }, data: { aspectRatio: '4:3' } },
    ],
    edges: [
      { from: 'director', to: 'script' },
      { from: 'script', to: 'gen' },
      { from: 'style', to: 'gen' },
    ],
  },
  {
    key: 'product-ecommerce',
    nodes: [
      { ref: 'product', kind: 'image', position: { x: 0, y: 0 } },
      { ref: 'info', kind: 'text', position: { x: 0, y: ROW }, data: { text: '' } },
      {
        ref: 'gen',
        kind: 'imageGenerator',
        position: { x: COL, y: 0 },
        data: {
          aspectRatio: '1:1',
          angleKeys: ['front', 'three-quarter-right', 'top-down'],
          snippetIds: ['b-studio', 'b-detail'],
          lightingPresetKey: 'three-point',
          lightPositionKeys: ['key', 'fill', 'rim'],
          lightColorKey: 'neutral',
          lightBrightnessKey: 'normal',
        },
      },
    ],
    edges: [
      { from: 'product', to: 'gen' },
      { from: 'info', to: 'gen' },
    ],
  },
  {
    key: 'full-short-drama',
    nodes: [
      { ref: 'director', kind: 'director', position: { x: 0, y: 0 } },
      { ref: 'script', kind: 'script', position: { x: COL, y: 0 } },
      {
        ref: 'character',
        kind: 'imageGenerator',
        position: { x: COL * 2, y: -ROW / 2 },
        data: { aspectRatio: '3:4', angleKeys: ['front'] },
      },
      {
        ref: 'scene',
        kind: 'imageGenerator',
        position: { x: COL * 2, y: ROW / 2 },
        data: { aspectRatio: '16:9' },
      },
      {
        ref: 'video',
        kind: 'videoGenerator',
        position: { x: COL * 3, y: 0 },
        data: { aspectRatio: '16:9', durationSeconds: 5 },
      },
      { ref: 'stitch', kind: 'videoStitch', position: { x: COL * 4, y: 0 } },
    ],
    edges: [
      { from: 'director', to: 'script' },
      { from: 'script', to: 'character' },
      { from: 'script', to: 'scene' },
      { from: 'character', to: 'video' },
      { from: 'scene', to: 'video' },
      { from: 'video', to: 'stitch' },
    ],
  },
  {
    key: 'multi-time-scene',
    nodes: [
      { ref: 'base', kind: 'text', position: { x: 0, y: 0 }, data: { text: '' } },
      {
        ref: 'day',
        kind: 'imageGenerator',
        position: { x: COL, y: -ROW },
        data: { aspectRatio: '16:9', lightColorKey: 'neutral' },
      },
      {
        ref: 'dusk',
        kind: 'imageGenerator',
        position: { x: COL, y: 0 },
        data: { aspectRatio: '16:9', lightColorKey: 'golden', lightingPresetKey: 'natural' },
      },
      {
        ref: 'night',
        kind: 'imageGenerator',
        position: { x: COL, y: ROW },
        data: { aspectRatio: '16:9', lightColorKey: 'blue-hour' },
      },
      {
        ref: 'rain',
        kind: 'imageGenerator',
        position: { x: COL, y: ROW * 2 },
        data: { aspectRatio: '16:9', lightColorKey: 'cool', lightBrightnessKey: 'soft' },
      },
    ],
    edges: [
      { from: 'base', to: 'day' },
      { from: 'base', to: 'dusk' },
      { from: 'base', to: 'night' },
      { from: 'base', to: 'rain' },
    ],
  },
  {
    key: 'image-tools-demo',
    nodes: [
      { ref: 'prompt', kind: 'text', position: { x: 0, y: 0 }, data: { text: '' } },
      { ref: 'gen', kind: 'imageGenerator', position: { x: COL, y: 0 } },
    ],
    edges: [{ from: 'prompt', to: 'gen' }],
  },
]
