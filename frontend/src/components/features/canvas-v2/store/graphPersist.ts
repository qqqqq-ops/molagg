/**
 * 画布存盘 / 快照 / 模板要用的纯函数：清洗、对比、截取、铺开。
 * 不碰 store、不碰网络，checks/ 里直接拿 node 跑。
 */

import type { CanvasEdge, CanvasNode } from '../canvasV2.types'

export type Graph = { nodes: CanvasNode[]; edges: CanvasEdge[] }

const RUNNING = new Set(['submitting', 'pending', 'processing'])
/** 只跟这一刻的界面有关、存下来没意义的字段（选中、正在拖） */
const TRANSIENT_NODE_KEYS = ['selected', 'dragging', 'resizing'] as const
/** 生成器的运行状态：模板里不该带，对比时也不算「内容变了」 */
const RUN_STATE_KEYS = ['status', 'taskId', 'errorMessage', 'progress', 'startedAt'] as const

/** 存盘前去掉选中 / 拖动这些一次性的状态 */
export function cleanGraph(nodes: CanvasNode[], edges: CanvasEdge[]): Graph {
  return {
    nodes: nodes.map((node) => {
      const copy = { ...node } as Record<string, unknown>
      for (const key of TRANSIENT_NODE_KEYS) delete copy[key]
      return copy as CanvasNode
    }),
    edges: edges.map((edge) => {
      const { selected: _selected, ...rest } = edge
      return rest as CanvasEdge
    }),
  }
}

/** 需要重新接回轮询的节点：存盘时还在生成、且留着上游 taskId 的生成器 */
export type ReattachEntry = { nodeId: string; taskId: string; mode: 'image' | 'video' }

/**
 * 读回来的画布里，有些节点存盘时还在生成——刷新之后内存里的轮询已经断了，转圈会一直转下去。
 * 这里先把它们放回「空闲」（避免死转），同时挑出「留着 taskId 的生成器」交给调用方重新接回轮询：
 * 接回后任务还在跑就继续显示进度、已经出片就自动落结果节点。接不回的（没 taskId）就只能去任务队列看。
 */
export function settleStaleRuns(nodes: CanvasNode[]) {
  let count = 0
  const resumable: ReattachEntry[] = []
  const next = nodes.map((node) => {
    if (!RUNNING.has(String(node.data?.status ?? ''))) return node
    count += 1
    const taskId = node.data?.taskId
    const mode = node.type === 'videoGenerator' ? 'video' : node.type === 'imageGenerator' ? 'image' : null
    if (typeof taskId === 'string' && taskId && mode) resumable.push({ nodeId: node.id, taskId, mode })
    return { ...node, data: { ...node.data, status: 'idle', progress: null } }
  })
  return { nodes: next, count, resumable }
}

function contentOf(node: CanvasNode) {
  const data = { ...(node.data ?? {}) } as Record<string, unknown>
  for (const key of RUN_STATE_KEYS) delete data[key]
  return JSON.stringify(data)
}

const edgeKey = (edge: CanvasEdge) => `${edge.source}→${edge.target}`

export type GraphDiff = {
  added: CanvasNode[]
  removed: CanvasNode[]
  /** 内容改了（提示词、模型、文字…），不含位置 */
  changed: CanvasNode[]
  /** 只挪了位置 */
  moved: number
  edgesAdded: number
  edgesRemoved: number
}

/** 从 before 到 after 变了什么。按节点 id 对齐 */
export function diffGraphs(before: Graph, after: Graph): GraphDiff {
  const old = new Map(before.nodes.map((node) => [node.id, node]))
  const now = new Map(after.nodes.map((node) => [node.id, node]))
  const diff: GraphDiff = { added: [], removed: [], changed: [], moved: 0, edgesAdded: 0, edgesRemoved: 0 }

  for (const node of after.nodes) {
    const previous = old.get(node.id)
    if (!previous) {
      diff.added.push(node)
      continue
    }
    if (contentOf(previous) !== contentOf(node) || previous.type !== node.type) diff.changed.push(node)
    else if (previous.position.x !== node.position.x || previous.position.y !== node.position.y) diff.moved += 1
  }
  for (const node of before.nodes) if (!now.has(node.id)) diff.removed.push(node)

  const oldEdges = new Set(before.edges.map(edgeKey))
  const newEdges = new Set(after.edges.map(edgeKey))
  diff.edgesAdded = [...newEdges].filter((key) => !oldEdges.has(key)).length
  diff.edgesRemoved = [...oldEdges].filter((key) => !newEdges.has(key)).length
  return diff
}

export function isSameGraph(diff: GraphDiff) {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    diff.moved === 0 &&
    diff.edgesAdded === 0 &&
    diff.edgesRemoved === 0
  )
}

function stripRunState(node: CanvasNode): CanvasNode {
  if (!node.data || !('status' in node.data)) return node
  return {
    ...node,
    data: { ...node.data, status: 'idle', taskId: null, errorMessage: null, progress: null, startedAt: null },
  }
}

/**
 * 「保存为模板」：从当前画布里截出选中的那一段。
 * - 选中了组 → 组员一起带上；
 * - 只选了组里的某个节点、没选组 → 把它换回画布坐标、去掉 parentId，单独带走；
 * - 只保留两端都在里面的连线；
 * - 生成器的运行状态清掉（模板是「怎么搭」，不是「跑到哪了」）。
 */
export function extractSelection(nodes: CanvasNode[], edges: CanvasEdge[], ids: string[]): Graph {
  const picked = new Set(ids)
  for (const node of nodes) if (node.parentId && picked.has(node.parentId)) picked.add(node.id)
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const kept = nodes
    .filter((node) => picked.has(node.id))
    .map((node) => {
      if (!node.parentId || picked.has(node.parentId)) return stripRunState(node)
      const parent = byId.get(node.parentId)
      const { parentId: _parentId, extent: _extent, ...rest } = node
      return stripRunState({
        ...rest,
        hidden: false,
        position: {
          x: (parent?.position.x ?? 0) + node.position.x,
          y: (parent?.position.y ?? 0) + node.position.y,
        },
      } as CanvasNode)
    })
  return cleanGraph(
    kept,
    edges.filter((edge) => picked.has(edge.source) && picked.has(edge.target)),
  )
}

/**
 * 把一张存下来的图（模板）铺到画布上：全部换新 id（组员的 parentId、连线两端跟着换），
 * 整体平移到 origin（顶层节点的左上角对齐 origin），父节点排在子节点前面。
 */
export function instantiateGraph(
  graph: Graph,
  origin: { x: number; y: number },
  makeId: (kind: string) => string,
): Graph {
  const idMap = new Map(graph.nodes.map((node) => [node.id, makeId(node.type ?? 'text')]))
  const isChild = (node: CanvasNode) => Boolean(node.parentId && idMap.has(node.parentId))
  const top = graph.nodes.filter((node) => !isChild(node))
  const minX = top.length ? Math.min(...top.map((node) => node.position.x)) : 0
  const minY = top.length ? Math.min(...top.map((node) => node.position.y)) : 0

  const nodes = graph.nodes.map((node) => {
    const base = stripRunState({ ...node, id: idMap.get(node.id)!, selected: false })
    if (isChild(node)) return { ...base, parentId: idMap.get(node.parentId!) }
    const { parentId: _parentId, ...rest } = base
    return {
      ...rest,
      position: { x: node.position.x - minX + origin.x, y: node.position.y - minY + origin.y },
    } as CanvasNode
  })
  // 父在子前（React Flow 的要求）
  nodes.sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)))

  const stamp = Date.now().toString(36)
  const edges = graph.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge, index) => ({
      ...edge,
      id: `edge-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${stamp}-${index}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: false,
    }))
  return { nodes, edges }
}
