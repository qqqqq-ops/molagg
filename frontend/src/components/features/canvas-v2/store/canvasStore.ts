'use client'

import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react'
import { create } from 'zustand'

import {
  CANVAS_FILE_VERSION,
  STICKY_COLORS,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeKind,
  type CanvasProjectFile,
} from '../canvasV2.types'

/** 撤销栈最多留这么多步；节点里可能带 base64 预览，留太多会吃内存 */
const HISTORY_LIMIT = 50

type Snapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] }

type CanvasState = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  past: Snapshot[]
  future: Snapshot[]

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  addNode: (kind: CanvasNodeKind, position: { x: number; y: number }, data?: Record<string, unknown>) => string
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  removeNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => void
  /** 整理 / 成组 / 解组这类一次改一大片的操作：整张图换掉，记一步历史 */
  commit: (next: { nodes?: CanvasNode[]; edges?: CanvasEdge[] }) => void
  /** 打开页面时把存着的画布读进来：不算一步操作，撤销栈清空 */
  hydrate: (nodes: CanvasNode[], edges: CanvasEdge[]) => void

  undo: () => void
  redo: () => void

  loadProject: (file: CanvasProjectFile, mode: 'replace' | 'merge') => void
  toProjectFile: (name?: string) => CanvasProjectFile
  clear: () => void
}

let nodeSeq = 0
export function nextNodeId(kind: CanvasNodeKind) {
  nodeSeq += 1
  return `${kind}-${Date.now().toString(36)}-${nodeSeq}`
}

/** 新建节点时的默认数据；每种节点的必填字段都在这里给出初值 */
function defaultNodeData(kind: CanvasNodeKind): Record<string, unknown> {
  const generatorBase = {
    prompt: '',
    negativePrompt: '',
    modelId: null,
    channelId: null,
    snippetIds: [],
    status: 'idle',
    taskId: null,
    errorMessage: null,
    progress: null,
    startedAt: null,
    /** 一次生成几条；可选范围按模型给 */
    outputCount: 1,
  }

  switch (kind) {
    case 'text':
      return { text: '' }
    case 'markdown':
      return { markdown: '' }
    case 'stickyNote':
      return { text: '', color: STICKY_COLORS[0] }
    case 'image':
    case 'video':
    case 'audio':
      return { url: null, thumbnailUrl: null, taskId: null, sourceNodeId: null }
    case 'imageGenerator':
      return {
        ...generatorBase,
        aspectRatio: '1:1',
        angleKeys: [],
        lightingPresetKey: null,
        lightPositionKeys: [],
        lightColorKey: null,
        lightBrightnessKey: null,
        shotSizeKey: null,
        cameraHeightKey: null,
      }
    case 'videoGenerator':
      return { ...generatorBase, aspectRatio: '16:9', durationSeconds: 5, startFrameNodeId: null, endFrameNodeId: null }
    case 'audioGenerator':
      return { ...generatorBase, voiceId: null, text: '' }
    case 'promptGroup':
      return { snippetIds: [] }
    case 'director':
      return { theme: '', outline: '' }
    case 'script':
      return { script: '' }
    case 'videoStitch':
      return { clipNodeIds: [], resultUrl: null, status: 'idle' }
    case 'group':
      return { collapsed: false }
    default:
      return {}
  }
}

/** 记一步历史：只在结构真的变了的时候调，拖动过程中不记 */
function pushHistory(state: CanvasState): Pick<CanvasState, 'past' | 'future'> {
  const past = [...state.past, { nodes: state.nodes, edges: state.edges }]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],

  onNodesChange: (changes) => {
    // 只有增删才记历史；位置/选中的变化太频繁，记了撤销会变成一帧一帧倒带
    const structural = changes.some((change) => change.type === 'remove' || change.type === 'add')
    set((state) => ({
      ...(structural ? pushHistory(state) : {}),
      nodes: applyNodeChanges(changes, state.nodes) as CanvasNode[],
    }))
  },

  onEdgesChange: (changes) => {
    const structural = changes.some((change) => change.type === 'remove' || change.type === 'add')
    set((state) => ({
      ...(structural ? pushHistory(state) : {}),
      edges: applyEdgeChanges(changes, state.edges),
    }))
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    set((state) => {
      // 同一对端口只连一次
      const exists = state.edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target &&
          edge.sourceHandle === connection.sourceHandle &&
          edge.targetHandle === connection.targetHandle,
      )
      if (exists) return state
      const edge: CanvasEdge = {
        id: `edge-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
        animated: true,
      }
      return { ...pushHistory(state), edges: [...state.edges, edge] }
    })
  },

  addNode: (kind, position, data) => {
    const id = nextNodeId(kind)
    set((state) => ({
      ...pushHistory(state),
      nodes: [
        ...state.nodes,
        {
          id,
          type: kind,
          position,
          // 只有标题栏能拖，否则按住节点里的输入框一拖，整个节点就跟着走、文字也选不中
          dragHandle: '.cv2-drag-handle',
          // 不写死 title：留空让节点按当前语言显示类型名（见 canvasV2.types 注释）。
          // 预设铺开时会显式传 title，那是具体名字，定住不跟着切语言。
          data: { ...defaultNodeData(kind), ...data },
        } as CanvasNode,
      ],
    }))
    return id
  },

  updateNodeData: (id, patch) => {
    // 改节点内容（打字、选模型）不记历史，否则撤销一次只退一个字
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)),
    }))
  },

  removeNodes: (ids) => {
    if (ids.length === 0) return
    const set_ = new Set(ids)
    // 删组连组员一起删（跟 React Flow 自己按删除键的行为一致）；否则组员的 parentId 指向空，整块画布报错
    for (const node of get().nodes) if (node.parentId && set_.has(node.parentId)) set_.add(node.id)
    set((state) => ({
      ...pushHistory(state),
      nodes: state.nodes.filter((node) => !set_.has(node.id)),
      // 连着被删节点的线一起删，否则会留下指向空节点的悬空边
      edges: state.edges.filter((edge) => !set_.has(edge.source) && !set_.has(edge.target)),
    }))
  },

  duplicateNodes: (ids) => {
    if (ids.length === 0) return
    set((state) => {
      const source = state.nodes.filter((node) => ids.includes(node.id))
      const idMap = new Map(source.map((node) => [node.id, nextNodeId((node.type ?? 'text') as CanvasNodeKind)]))
      const copies = source.map((node) => {
        // 组和组员一起复制时，副本组员要挂到副本组下面；只复制组员时留在原组里，偏移一点
        const copiedParent = node.parentId ? idMap.get(node.parentId) : undefined
        const offset = copiedParent ? 0 : 40
        return {
          ...node,
          id: idMap.get(node.id)!,
          ...(copiedParent ? { parentId: copiedParent } : {}),
          position: { x: node.position.x + offset, y: node.position.y + offset },
          selected: false,
        }
      })
      return { ...pushHistory(state), nodes: [...state.nodes, ...copies] }
    })
  },

  undo: () => {
    const { past, nodes, edges } = get()
    const previous = past[past.length - 1]
    if (!previous) return
    set((state) => ({
      past: past.slice(0, -1),
      future: [{ nodes, edges }, ...state.future].slice(0, HISTORY_LIMIT),
      nodes: previous.nodes,
      edges: previous.edges,
    }))
  },

  redo: () => {
    const { future, nodes, edges } = get()
    const next = future[0]
    if (!next) return
    set((state) => ({
      past: [...state.past, { nodes, edges }].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      nodes: next.nodes,
      edges: next.edges,
    }))
  },

  loadProject: (file, mode) => {
    set((state) => {
      if (mode === 'replace') {
        return { ...pushHistory(state), nodes: file.nodes, edges: file.edges }
      }
      // 合并：外来 id 可能和当前画布撞车，全部重编号，同时把边上的引用改过来
      const idMap = new Map<string, string>()
      const nodes = file.nodes.map((node) => {
        const id = nextNodeId((node.type ?? 'text') as CanvasNodeKind)
        idMap.set(node.id, id)
        return { ...node, id }
      })
      // 组员坐标是相对组的，不再平移；parentId 跟着换成新 id
      nodes.forEach((node, index) => {
        const parentId = node.parentId ? idMap.get(node.parentId) : undefined
        nodes[index] = parentId
          ? { ...node, parentId }
          : { ...node, parentId: undefined, position: { x: node.position.x + 60, y: node.position.y + 60 } }
      })
      const edges = file.edges
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: `edge-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${Date.now().toString(36)}`,
          source: idMap.get(edge.source)!,
          target: idMap.get(edge.target)!,
        }))
      return { ...pushHistory(state), nodes: [...state.nodes, ...nodes], edges: [...state.edges, ...edges] }
    })
  },

  toProjectFile: (name) => ({
    version: CANVAS_FILE_VERSION,
    app: 'molagg-canvas-v2',
    name,
    exportedAt: new Date().toISOString(),
    nodes: get().nodes,
    edges: get().edges,
  }),

  commit: (next) =>
    set((state) => ({
      ...pushHistory(state),
      nodes: next.nodes ?? state.nodes,
      edges: next.edges ?? state.edges,
    })),

  hydrate: (nodes, edges) => set({ nodes, edges, past: [], future: [] }),

  clear: () => set((state) => ({ ...pushHistory(state), nodes: [], edges: [] })),
}))
