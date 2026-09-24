/**
 * 收集「连进这个生成器的上游节点」，把连线真正变成输入。
 *
 * 画布的卖点是「每个片段的关联引用一目了然」——那连线就必须真的起作用：
 * 连一段文字进来，它要进提示词；连一张图进来，它要当参考图 / 首帧；
 * 连一组提示词素材进来，它要被勾上。
 *
 * 两条规则：
 * 1. **只看直接上游（一跳）**。多跳会让「这张图到底从哪来的」变得不可读，违背画布的卖点。
 *    例外是分组：从组连出来的线等于组里每个节点各连一根，组本身不算一跳。
 * 2. **上游是生成器时，取它产出的素材**。预设里的链路是
 *    `文字 → 图片生成器 → 多角度生成器`，第二个生成器的直接上游是第一个生成器本身，
 *    要的其实是它生成出来的那张图（结果节点的 sourceNodeId 指回生成器）。
 */

import type { CanvasEdge, CanvasNode } from '../canvasV2.types'

export type GraphInputs = {
  /** 上游的文字 / Markdown / 脚本内容 */
  texts: string[]
  /** 上游提示词组勾选的素材 id */
  snippetIds: string[]
  /** 上游图片的地址（含生成器产出的） */
  imageUrls: string[]
  /** 上游视频的地址 */
  videoUrls: string[]
  /** 上游音频的地址 */
  audioUrls: string[]
}

const EMPTY: GraphInputs = { texts: [], snippetIds: [], imageUrls: [], videoUrls: [], audioUrls: [] }

const TEXT_KINDS = new Set(['text', 'markdown', 'script', 'stickyNote'])
const GENERATOR_KINDS = new Set(['imageGenerator', 'videoGenerator', 'audioGenerator'])

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** 某个生成器产出的素材节点（结果节点的 sourceNodeId 指回它） */
function resultsOf(generatorId: string, nodes: CanvasNode[]) {
  return nodes.filter((node) => node.data?.sourceNodeId === generatorId)
}

export function collectUpstreamInputs(
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): GraphInputs {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  // 从分组连过来的线 = 组里每个节点都连过来（「组右侧拉一根线即可整体连下游」），仍然只算一跳
  const upstreamIds = edges
    .filter((edge) => edge.target === nodeId)
    .flatMap((edge) =>
      byId.get(edge.source)?.type === 'group'
        ? nodes.filter((node) => node.parentId === edge.source).map((node) => node.id)
        : [edge.source],
    )
  if (upstreamIds.length === 0) return EMPTY

  const result: GraphInputs = { texts: [], snippetIds: [], imageUrls: [], videoUrls: [], audioUrls: [] }

  const takeMedia = (node: CanvasNode) => {
    const url = asString(node.data?.url)
    if (!url) return
    if (node.type === 'image') result.imageUrls.push(url)
    else if (node.type === 'video') result.videoUrls.push(url)
    else if (node.type === 'audio') result.audioUrls.push(url)
  }

  for (const id of upstreamIds) {
    const node = byId.get(id)
    if (!node) continue

    if (node.type && TEXT_KINDS.has(node.type)) {
      const text =
        asString(node.data?.text) ?? asString(node.data?.markdown) ?? asString(node.data?.script)
      if (text) result.texts.push(text)
      continue
    }

    if (node.type === 'director') {
      // 导演台：主题和大纲都算提示词的一部分
      const theme = asString(node.data?.theme)
      const outline = asString(node.data?.outline)
      const combined = [theme, outline].filter(Boolean).join('\n')
      if (combined) result.texts.push(combined)
      continue
    }

    if (node.type === 'promptGroup') {
      const ids = node.data?.snippetIds
      if (Array.isArray(ids)) result.snippetIds.push(...ids.filter((item): item is string => typeof item === 'string'))
      continue
    }


    if (node.type && GENERATOR_KINDS.has(node.type)) {
      // 上游是生成器 → 用它产出的素材
      for (const produced of resultsOf(id, nodes)) takeMedia(produced)
      continue
    }

    takeMedia(node)
  }

  // 同一张图可能通过两条路径连进来，去重，否则会被当成两张参考图占额度
  result.imageUrls = [...new Set(result.imageUrls)]
  result.videoUrls = [...new Set(result.videoUrls)]
  result.audioUrls = [...new Set(result.audioUrls)]
  result.snippetIds = [...new Set(result.snippetIds)]

  return result
}

/** 摘要里的一项，比如 { kind: 'images', count: 2 }；拼成「2 张图」是组件按当前语言做的 */
export type InputSummaryPart = {
  kind: 'images' | 'videos' | 'audios' | 'texts' | 'snippets'
  count: number
}

/**
 * 给节点上显示用的摘要。
 * 这里只出「几项、各多少」，**不拼文案**——中英文量词位置不一样，
 * 拼字符串就没法翻译了，交给组件去查 canvas.upstream.*。
 */
export function summarizeInputs(inputs: GraphInputs): InputSummaryPart[] {
  // 用可选链：这个函数的返回值直接参与渲染，万一哪天少传一个字段，
  // 不该让整块画布白屏。
  const parts: InputSummaryPart[] = []
  if (inputs.imageUrls?.length) parts.push({ kind: 'images', count: inputs.imageUrls.length })
  if (inputs.videoUrls?.length) parts.push({ kind: 'videos', count: inputs.videoUrls.length })
  if (inputs.audioUrls?.length) parts.push({ kind: 'audios', count: inputs.audioUrls.length })
  if (inputs.texts?.length) parts.push({ kind: 'texts', count: inputs.texts.length })
  if (inputs.snippetIds?.length) parts.push({ kind: 'snippets', count: inputs.snippetIds.length })
  return parts
}
