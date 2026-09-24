/**
 * 助手动作：文本模型回一段 JSON，这里把它翻译成对画布的改动。
 *
 * 两条硬规矩：
 * 1. **助手不许点生成**。动作表里没有「运行」——跑一次就是真金白银的上游调用，
 *    必须由人按下那个 ▶。助手只负责把节点建好、连好、填好。
 * 2. **看不懂就整条丢掉**。模型回的东西不可信，字段缺一个、类型不对、指向不存在的节点，
 *    都当这条动作不存在，并把原因收集起来显示给用户——
 *    宁可少做一步，也不要在用户的画布上乱改。
 */

import type { CanvasNodeKind } from '../canvasV2.types'

/** 助手能改的字段；没列进来的一律不给改（比如 status / taskId 这些运行状态） */
export const EDITABLE_FIELDS = [
  'prompt',
  'negativePrompt',
  'title',
  'text',
  'markdown',
  'script',
  'theme',
  'outline',
  'aspectRatio',
  'durationSeconds',
  'outputCount',
  'angleKeys',
  'snippetIds',
  'lightPositionKeys',
  'lightColorKey',
  'lightBrightnessKey',
  'lightingPresetKey',
  'shotSizeKey',
  'cameraHeightKey',
] as const

export type EditableField = (typeof EDITABLE_FIELDS)[number]

const FIELD_SET = new Set<string>(EDITABLE_FIELDS)

export const NODE_KINDS: CanvasNodeKind[] = [
  'text',
  'markdown',
  'stickyNote',
  'image',
  'video',
  'audio',
  'imageGenerator',
  'videoGenerator',
  'audioGenerator',
  'promptGroup',
  'director',
  'script',
  'videoStitch',
]

const KIND_SET = new Set<string>(NODE_KINDS)

export type AssistantAction =
  /** 改已有节点的某个字段 */
  | { type: 'set'; nodeId: string; field: EditableField; value: unknown }
  /** 新建一个节点；`ref` 是这一批动作内部的临时名字，后面的 connect 可以引用它 */
  | { type: 'add'; kind: CanvasNodeKind; ref: string; fields?: Partial<Record<EditableField, unknown>> }
  /** 连线；两端可以是真实 nodeId，也可以是同一批里 add 出来的 ref */
  | { type: 'connect'; from: string; to: string }
  /** 删节点 */
  | { type: 'remove'; nodeId: string }

export type ParseResult = {
  actions: AssistantAction[]
  /** 丢掉的动作和原因，显示给用户看，不是静默吞掉 */
  rejected: string[]
}

/** 模型爱在 JSON 外面裹 ```json ... ```，先剥掉 */
function stripFence(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fenced ? fenced[1] : raw).trim()
}

/** 整段里可能还混着解释文字，只取第一个完整的 {...} */
function extractObject(raw: string): string | null {
  const text = stripFence(raw)
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function isPlainValue(v: unknown) {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) return true
  return Array.isArray(v) && v.every((item) => typeof item === 'string')
}

/**
 * 把模型回的文本解析成动作表。
 * @param knownNodeIds 画布上真实存在的节点 id，用来挡住指向空气的动作
 */
export function parseAssistantActions(raw: string, knownNodeIds: string[]): ParseResult {
  const rejected: string[] = []
  const body = extractObject(raw ?? '')
  if (!body) return { actions: [], rejected: ['noJson'] }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { actions: [], rejected: ['badJson'] }
  }

  const list = (parsed as { actions?: unknown })?.actions
  if (!Array.isArray(list)) return { actions: [], rejected: ['noActions'] }

  const known = new Set(knownNodeIds)
  const refs = new Set<string>()
  const actions: AssistantAction[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      rejected.push('notAnObject')
      continue
    }
    const a = item as Record<string, unknown>
    const type = typeof a.type === 'string' ? a.type : ''

    if (type === 'set') {
      const nodeId = typeof a.nodeId === 'string' ? a.nodeId : ''
      const field = typeof a.field === 'string' ? a.field : ''
      if (!known.has(nodeId) && !refs.has(nodeId)) { rejected.push(`set:unknownNode:${nodeId || '?'}`); continue }
      if (!FIELD_SET.has(field)) { rejected.push(`set:badField:${field || '?'}`); continue }
      if (!isPlainValue(a.value)) { rejected.push(`set:badValue:${field}`); continue }
      actions.push({ type: 'set', nodeId, field: field as EditableField, value: a.value })
      continue
    }

    if (type === 'add') {
      const kind = typeof a.kind === 'string' ? a.kind : ''
      const ref = typeof a.ref === 'string' ? a.ref.trim() : ''
      if (!KIND_SET.has(kind)) { rejected.push(`add:badKind:${kind || '?'}`); continue }
      if (!ref) { rejected.push('add:noRef'); continue }
      if (refs.has(ref) || known.has(ref)) { rejected.push(`add:dupRef:${ref}`); continue }
      let fields: Partial<Record<EditableField, unknown>> | undefined
      if (a.fields && typeof a.fields === 'object' && !Array.isArray(a.fields)) {
        fields = {}
        for (const [k, v] of Object.entries(a.fields as Record<string, unknown>)) {
          if (!FIELD_SET.has(k)) { rejected.push(`add:badField:${k}`); continue }
          if (!isPlainValue(v)) { rejected.push(`add:badValue:${k}`); continue }
          fields[k as EditableField] = v
        }
      }
      refs.add(ref)
      actions.push({ type: 'add', kind: kind as CanvasNodeKind, ref, fields })
      continue
    }

    if (type === 'connect') {
      const from = typeof a.from === 'string' ? a.from : ''
      const to = typeof a.to === 'string' ? a.to : ''
      const ok = (id: string) => known.has(id) || refs.has(id)
      if (!ok(from)) { rejected.push(`connect:unknownNode:${from || '?'}`); continue }
      if (!ok(to)) { rejected.push(`connect:unknownNode:${to || '?'}`); continue }
      if (from === to) { rejected.push('connect:selfLoop'); continue }
      actions.push({ type: 'connect', from, to })
      continue
    }

    if (type === 'remove') {
      const nodeId = typeof a.nodeId === 'string' ? a.nodeId : ''
      // 只让删画布上本来就有的；同一批里刚建又删没有意义
      if (!known.has(nodeId)) { rejected.push(`remove:unknownNode:${nodeId || '?'}`); continue }
      actions.push({ type: 'remove', nodeId })
      continue
    }

    rejected.push(`badType:${type || '?'}`)
  }

  return { actions, rejected }
}

/** 应用动作时需要的画布能力；测试里传个假的就能跑 */
export type CanvasOps = {
  addNode: (kind: CanvasNodeKind, position: { x: number; y: number }, data?: Record<string, unknown>) => string
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  connect: (from: string, to: string) => void
  removeNodes: (ids: string[]) => void
  /** 新节点往哪放；调用方按当前视口给一个起点 */
  origin: { x: number; y: number }
}

export type ApplyResult = {
  added: string[]
  changed: number
  connected: number
  removed: number
}

/** 按顺序执行；`add` 出来的 ref 会即时登记，后面的 set / connect 就能引用它 */
export function applyAssistantActions(actions: AssistantAction[], ops: CanvasOps): ApplyResult {
  const refToId = new Map<string, string>()
  const resolve = (id: string) => refToId.get(id) ?? id
  const result: ApplyResult = { added: [], changed: 0, connected: 0, removed: 0 }
  let slot = 0

  for (const action of actions) {
    if (action.type === 'add') {
      // 新节点排成一列，别叠在一起
      const id = ops.addNode(
        action.kind,
        { x: ops.origin.x + slot * 360, y: ops.origin.y },
        action.fields ? { ...action.fields } : undefined,
      )
      slot += 1
      refToId.set(action.ref, id)
      result.added.push(id)
      continue
    }
    if (action.type === 'set') {
      ops.updateNodeData(resolve(action.nodeId), { [action.field]: action.value })
      result.changed += 1
      continue
    }
    if (action.type === 'connect') {
      ops.connect(resolve(action.from), resolve(action.to))
      result.connected += 1
      continue
    }
    ops.removeNodes([resolve(action.nodeId)])
    result.removed += 1
  }

  return result
}
