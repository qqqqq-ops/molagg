/**
 * 画布整图层面的纯函数：级联排批次、连线方向纠正、整理画布。
 *
 * 全部只吃 nodes / edges、吐新数据，不碰 store、不碰 React——
 * 这样 checks/ 里能直接拿 node 跑，不需要浏览器。
 */

import type { Connection } from '@xyflow/react'

import type { CanvasEdge, CanvasNode } from '../canvasV2.types'

/** 能真正提交任务的生成器。音频生成器还没有 TTS 渠道，不算 */
export const RUNNABLE_KINDS = new Set(['imageGenerator', 'videoGenerator'])
export const GENERATOR_KINDS = new Set(['imageGenerator', 'videoGenerator', 'audioGenerator'])
/** 只能当输入、永远不会是生成器产物的节点 */
const INPUT_ONLY_KINDS = new Set(['text', 'markdown', 'script', 'director', 'promptGroup'])
const MEDIA_KINDS = new Set(['image', 'video', 'audio'])

/** 节点没量过尺寸时（刚建、还没渲染）按类型估一个，整理画布 / 成组算边界要用 */
const FALLBACK_SIZE: Record<string, { width: number; height: number }> = {
  imageGenerator: { width: 340, height: 420 },
  videoGenerator: { width: 340, height: 420 },
  audioGenerator: { width: 300, height: 220 },
  stickyNote: { width: 220, height: 180 },
  markdown: { width: 300, height: 240 },
}

export function nodeSize(node: CanvasNode) {
  const fallback = FALLBACK_SIZE[node.type ?? ''] ?? { width: 260, height: 200 }
  return {
    width: node.measured?.width ?? node.width ?? fallback.width,
    height: node.measured?.height ?? node.height ?? fallback.height,
  }
}

/** 组里的节点坐标是相对组的，算布局前要换回画布坐标 */
export function absolutePosition(node: CanvasNode, byId: Map<string, CanvasNode>) {
  const parent = node.parentId ? byId.get(node.parentId) : undefined
  if (!parent) return node.position
  return { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y }
}

/**
 * 从分组连出去的线等于从组里每个节点连出去（「组右侧拉一根线即可整体连下游」）。
 * 排依赖、收输入之前先把这种边摊开。
 */
export function expandGroupEdges(nodes: CanvasNode[], edges: CanvasEdge[]) {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.parentId) continue
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id])
  }
  return edges.flatMap((edge) => {
    const members = children.get(edge.source)
    if (!members) return [edge]
    return members.map((id) => ({ ...edge, source: id }))
  })
}

export type CascadePlan = { ok: true; batches: string[][] } | { ok: false; reason: 'empty' | 'cyclic' }

/**
 * 级联执行的批次：同一批互不依赖、可以一起跑；后一批要等前一批出结果。
 *
 * 一个生成器排在第几批 = 它上游（沿连线往回追，隔着素材节点也算）最多有几层生成器。
 * 连线绕成圈就没有先后可言，整个拒掉，不猜。
 */
export function planCascade(nodes: CanvasNode[], edges: CanvasEdge[]): CascadePlan {
  const ids = new Set(nodes.map((node) => node.id))
  const kindOf = new Map(nodes.map((node) => [node.id, node.type ?? '']))
  const flat = expandGroupEdges(nodes, edges).filter((edge) => ids.has(edge.source) && ids.has(edge.target))

  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>([...ids].map((id) => [id, 0]))
  for (const edge of flat) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  // Kahn 拓扑排序；排不完说明有环
  const queue = [...ids].filter((id) => indegree.get(id) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const next of outgoing.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1
      indegree.set(next, left)
      if (left === 0) queue.push(next)
    }
  }
  if (order.length < ids.size) return { ok: false, reason: 'cyclic' }

  const depth = new Map<string, number>()
  for (const id of order) {
    let level = 0
    for (const from of incoming.get(id) ?? []) {
      level = Math.max(level, (depth.get(from) ?? 0) + (RUNNABLE_KINDS.has(kindOf.get(from) ?? '') ? 1 : 0))
    }
    depth.set(id, level)
  }

  const batches: string[][] = []
  for (const id of order) {
    if (!RUNNABLE_KINDS.has(kindOf.get(id) ?? '')) continue
    const level = depth.get(id) ?? 0
    ;(batches[level] ??= []).push(id)
  }
  const compact = batches.filter((batch) => batch && batch.length > 0)
  if (compact.length === 0) return { ok: false, reason: 'empty' }
  return { ok: true, batches: compact }
}

/**
 * 连线方向纠正：素材应该流进生成器。
 * 用户从生成器的出口拖到一段文字 / 一张自己传的图上，意思几乎一定是「把它接进来」，
 * 直接反过来连，并告诉他一声。生成器连向它自己产出的结果节点是正常方向，不动。
 */
export function orientConnection(
  connection: Connection,
  nodes: CanvasNode[],
): { connection: Connection; flipped: boolean } {
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (!source || !target || !GENERATOR_KINDS.has(source.type ?? '')) return { connection, flipped: false }

  const targetKind = target.type ?? ''
  const isOwnResult = target.data?.sourceNodeId === source.id
  const shouldFlip = INPUT_ONLY_KINDS.has(targetKind) || (MEDIA_KINDS.has(targetKind) && !isOwnResult)
  if (!shouldFlip) return { connection, flipped: false }

  return {
    connection: {
      source: connection.target,
      target: connection.source,
      sourceHandle: connection.targetHandle ?? null,
      targetHandle: connection.sourceHandle ?? null,
    },
    flipped: true,
  }
}

const TIDY_COLUMN_GAP = 90
const TIDY_ROW_GAP = 40

/**
 * 整理画布：按连线从左到右分列（上游在左），同一列从上到下排。
 *
 * 只动顶层节点——组里的节点跟着组走，组本身当一个整体排。
 * 同一列里保持原来的上下顺序，免得整理完用户找不到东西。
 * 返回新的 nodes，没动的节点原样返回（引用不变）。
 */
export function tidyLayout(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const top = nodes.filter((node) => !node.parentId)
  if (top.length === 0) return nodes
  const topIds = new Set(top.map((node) => node.id))
  const byId = new Map(nodes.map((node) => [node.id, node]))

  // 边的两端换成它们所在的顶层节点（组里的节点 → 组）
  const lift = (id: string) => {
    const node = byId.get(id)
    return node?.parentId && topIds.has(node.parentId) ? node.parentId : id
  }
  const links = edges
    .map((edge) => ({ from: lift(edge.source), to: lift(edge.target) }))
    .filter((link) => link.from !== link.to && topIds.has(link.from) && topIds.has(link.to))

  // 最长路径分列；有环时环上的节点按已知的最大深度算，不会死循环
  const column = new Map<string, number>(top.map((node) => [node.id, 0]))
  for (let pass = 0; pass < top.length; pass += 1) {
    let changed = false
    for (const link of links) {
      const next = (column.get(link.from) ?? 0) + 1
      if (next > (column.get(link.to) ?? 0) && next < top.length) {
        column.set(link.to, next)
        changed = true
      }
    }
    if (!changed) break
  }

  const origin = {
    x: Math.min(...top.map((node) => node.position.x)),
    y: Math.min(...top.map((node) => node.position.y)),
  }
  const columns: CanvasNode[][] = []
  for (const node of top) (columns[column.get(node.id) ?? 0] ??= []).push(node)

  const placed = new Map<string, { x: number; y: number }>()
  let x = origin.x
  for (const list of columns) {
    if (!list) continue
    list.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    let y = origin.y
    let widest = 0
    for (const node of list) {
      const size = nodeSize(node)
      placed.set(node.id, { x, y })
      y += size.height + TIDY_ROW_GAP
      widest = Math.max(widest, size.width)
    }
    x += widest + TIDY_COLUMN_GAP
  }

  return nodes.map((node) => {
    const position = placed.get(node.id)
    if (!position || (position.x === node.position.x && position.y === node.position.y)) return node
    return { ...node, position }
  })
}
