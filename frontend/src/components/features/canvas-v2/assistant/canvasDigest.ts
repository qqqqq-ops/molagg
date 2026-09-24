/**
 * 把当前画布压成一段文本讲给模型听。
 *
 * 不能把整张图原样塞进去：图片节点的 url 可能是几百 KB 的 base64，
 * 一个节点就能把上下文撑爆。所以这里只给**结构和能改的字段**，
 * 媒体一律只说「有图/没图」。
 */

import type { CanvasEdge, CanvasNode, CanvasNodeKind } from '../canvasV2.types'
import { EDITABLE_FIELDS, NODE_KINDS } from './assistantActions'

/** 单个字段最多带这么长，超了截断——提示词可能很长，但模型只需要知道个大概 */
const MAX_FIELD_CHARS = 200
/** 画布可能上百个节点，只讲前这么多，其余给个数字 */
const MAX_NODES = 40

function short(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length ? value.join(',') : null
  const s = String(value)
  if (!s.trim()) return null
  return s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}…` : s
}

function describeNode(node: CanvasNode): string {
  const data = (node.data ?? {}) as Record<string, unknown>
  const bits: string[] = []
  for (const field of EDITABLE_FIELDS) {
    const v = short(data[field])
    if (v !== null) bits.push(`${field}=${v}`)
  }
  // 媒体只说有没有，绝不把 url（可能是 base64）放进去
  if ('url' in data) bits.push(data.url ? 'hasMedia=yes' : 'hasMedia=no')
  if (data.modelId) bits.push(`modelId=${String(data.modelId)}`)
  return `- id=${node.id} kind=${node.type ?? '?'}${bits.length ? ` ${bits.join(' ')}` : ''}`
}

export function buildCanvasDigest(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  selectedIds: string[],
): string {
  const shown = nodes.slice(0, MAX_NODES)
  const lines: string[] = []
  lines.push(`NODES (${nodes.length} total${nodes.length > shown.length ? `, showing ${shown.length}` : ''}):`)
  for (const node of shown) lines.push(describeNode(node))
  lines.push('')
  lines.push(`EDGES (${edges.length}):`)
  for (const edge of edges.slice(0, MAX_NODES * 2)) lines.push(`- ${edge.source} -> ${edge.target}`)
  lines.push('')
  lines.push(`SELECTED: ${selectedIds.length ? selectedIds.join(', ') : '(none)'}`)
  return lines.join('\n')
}

/**
 * 系统提示词。**写英文**：跟提示词片段同理，模型对英文指令的遵从度更稳，
 * 而且这段不是给用户看的，界面语言换了它也不该变。
 */
export function buildSystemPrompt(): string {
  return [
    'You operate a node-based video/image generation canvas. The user gives instructions in natural language.',
    'You reply with ONE JSON object and nothing else:',
    '{"actions":[...],"reply":"one short sentence for the user, in the user\'s language"}',
    '',
    'Allowed actions:',
    '- {"type":"set","nodeId":"<existing id or a ref you just added>","field":"<field>","value":<string|number|bool|string[]>}',
    '- {"type":"add","kind":"<kind>","ref":"<temporary name>","fields":{"<field>":<value>}}',
    '- {"type":"connect","from":"<id or ref>","to":"<id or ref>"}',
    '- {"type":"remove","nodeId":"<existing id>"}',
    '',
    `Node kinds: ${NODE_KINDS.join(', ')}`,
    `Editable fields: ${EDITABLE_FIELDS.join(', ')}`,
    '',
    'Rules:',
    '- You CANNOT start a generation. The user presses the run button. Never claim you generated anything.',
    '- Edges go upstream -> downstream: material/text nodes feed INTO generator nodes.',
    '- Prompts you write into `prompt` fields must be in English; they are sent to image/video models.',
    '- Only use ids that appear in the canvas description, or refs you create in this same batch.',
    '- If the request is unclear or needs no change, return {"actions":[],"reply":"..."} and ask.',
  ].join('\n')
}

/** 发给模型的完整一条消息：系统规则 + 画布现状 + 用户这句话 */
export function buildAssistantMessage(digest: string, instruction: string): string {
  return `${buildSystemPrompt()}\n\nCANVAS:\n${digest}\n\nUSER:\n${instruction}`
}

export type { CanvasNodeKind }
