/**
 * 成组 / 解组 / 按功能自动成组 / 折叠。纯函数，只吃 nodes / edges。
 *
 * 用的是 React Flow 自带的父子节点：组是一个 type=group 的节点，
 * 组里的节点带 parentId、坐标相对组的左上角。React Flow 要求**父节点排在子节点前面**，
 * 这里所有返回的数组都保证这个顺序。
 *
 * 只有一层：组不能再套组（参考站也是这么定的，套娃之后「这个节点到底在哪」就说不清了）。
 */

import type { CanvasEdge, CanvasNode } from '../canvasV2.types'
import { nodeSize } from './graphOps'

const GROUP_PADDING = 24
/** 组头（标题 + 折叠按钮）的高度；折叠后组就只剩这么高 */
export const GROUP_HEADER = 38
const MEDIA_KINDS = new Set(['image', 'video', 'audio'])

export type GroupResult =
  | { ok: true; nodes: CanvasNode[]; groupId: string; count: number; mediaOnly: boolean }
  | { ok: false; reason: 'needTwo' | 'noNesting' }

/** 把选中的几个节点包进一个新组 */
export function groupNodes(nodes: CanvasNode[], ids: string[], groupId: string): GroupResult {
  const picked = nodes.filter((node) => ids.includes(node.id))
  if (picked.some((node) => node.type === 'group' || node.parentId)) return { ok: false, reason: 'noNesting' }
  if (picked.length < 2) return { ok: false, reason: 'needTwo' }

  const left = Math.min(...picked.map((node) => node.position.x))
  const top = Math.min(...picked.map((node) => node.position.y))
  const right = Math.max(...picked.map((node) => node.position.x + nodeSize(node).width))
  const bottom = Math.max(...picked.map((node) => node.position.y + nodeSize(node).height))

  const origin = { x: left - GROUP_PADDING, y: top - GROUP_PADDING - GROUP_HEADER }
  const group: CanvasNode = {
    id: groupId,
    type: 'group',
    position: origin,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2 + GROUP_HEADER,
    dragHandle: '.cv2-drag-handle',
    data: { collapsed: false },
  }
  const children = picked.map((node) => ({
    ...node,
    parentId: groupId,
    position: { x: node.position.x - origin.x, y: node.position.y - origin.y },
    selected: false,
  }))
  const pickedIds = new Set(picked.map((node) => node.id))
  return {
    ok: true,
    // 组紧跟在其余节点后面、组员再跟在组后面：父在子前
    nodes: [...nodes.filter((node) => !pickedIds.has(node.id)), group, ...children],
    groupId,
    count: children.length,
    mediaOnly: children.every((node) => MEDIA_KINDS.has(node.type ?? '')),
  }
}

/**
 * 选中了哪些组要解：直接选中的组 + 选中节点所在的组。
 * （用户选中组里的一个节点按 Cmd+Shift+G，意思也是解开它所在的那个组。）
 */
export function groupsToUngroup(nodes: CanvasNode[], selectedIds: string[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const result = new Set<string>()
  for (const id of selectedIds) {
    const node = byId.get(id)
    if (!node) continue
    if (node.type === 'group') result.add(node.id)
    else if (node.parentId && byId.get(node.parentId)?.type === 'group') result.add(node.parentId)
  }
  return [...result]
}

/** 解组：组员换回画布坐标、去掉 parentId，组本身删掉；从组连出去的线摊到组员身上，不丢连接 */
export function ungroupNodes(nodes: CanvasNode[], edges: CanvasEdge[], groupIds: string[]) {
  const groups = new Map(nodes.filter((node) => groupIds.includes(node.id)).map((node) => [node.id, node]))
  const released = nodes
    .filter((node) => !groups.has(node.id))
    .map((node) => {
      const parent = node.parentId ? groups.get(node.parentId) : undefined
      if (!parent) return node
      const { parentId: _parentId, extent: _extent, ...rest } = node
      return {
        ...rest,
        hidden: false,
        position: { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y },
      } as CanvasNode
    })

  const members = (groupId: string) => nodes.filter((node) => node.parentId === groupId).map((node) => node.id)
  const nextEdges = edges.flatMap((edge) => {
    if (groups.has(edge.target)) return []
    if (!groups.has(edge.source)) return [edge]
    return members(edge.source).map((id) => ({ ...edge, id: `${edge.id}-${id}`, source: id }))
  })

  return { nodes: released, edges: nextEdges }
}

/**
 * 按功能自动成组：把连在一起的一串节点（一条工作流）各包成一组。
 * 已经在组里的、组本身、单独一个没连线的节点都不动。
 */
export function autoGroup(nodes: CanvasNode[], edges: CanvasEdge[], makeId: () => string) {
  const free = nodes.filter((node) => node.type !== 'group' && !node.parentId)
  const freeIds = new Set(free.map((node) => node.id))

  // 并查集找连通块
  const parent = new Map(free.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  for (const edge of edges) {
    if (!freeIds.has(edge.source) || !freeIds.has(edge.target)) continue
    parent.set(find(edge.source), find(edge.target))
  }
  const components = new Map<string, string[]>()
  for (const node of free) {
    const root = find(node.id)
    components.set(root, [...(components.get(root) ?? []), node.id])
  }

  let next = nodes
  let count = 0
  for (const ids of components.values()) {
    if (ids.length < 2) continue
    const result = groupNodes(next, ids, makeId())
    if (!result.ok) continue
    next = result.nodes
    count += 1
  }
  return { nodes: next, count }
}

/** 折叠 / 展开一个组：折叠时组员藏起来、组缩成只剩组头；展开时按原来的高度恢复 */
export function setGroupCollapsed(nodes: CanvasNode[], groupId: string, collapsed: boolean): CanvasNode[] {
  return nodes.map((node) => {
    if (node.id === groupId) {
      const data = node.data ?? {}
      if (Boolean(data.collapsed) === collapsed) return node
      if (collapsed) {
        return {
          ...node,
          height: GROUP_HEADER,
          data: { ...data, collapsed: true, expandedHeight: node.height ?? nodeSize(node).height },
        }
      }
      const expandedHeight = typeof data.expandedHeight === 'number' ? data.expandedHeight : node.height
      return { ...node, height: expandedHeight, data: { ...data, collapsed: false, expandedHeight: undefined } }
    }
    if (node.parentId === groupId) return { ...node, hidden: collapsed, selected: false }
    return node
  })
}

/** 全部折叠 / 展开：只要有一个是展开的就全部折叠，否则全部展开 */
export function toggleAllGroups(nodes: CanvasNode[]) {
  const groups = nodes.filter((node) => node.type === 'group')
  const collapse = groups.some((node) => !node.data?.collapsed)
  let next = nodes
  for (const group of groups) next = setGroupCollapsed(next, group.id, collapse)
  return { nodes: next, count: groups.length, collapsed: collapse }
}
