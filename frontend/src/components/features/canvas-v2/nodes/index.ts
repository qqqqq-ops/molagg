import type { EdgeTypes, NodeTypes } from '@xyflow/react'

import { FlowEdge } from './FlowEdge'
import { AudioNode, ImageNode, MarkdownNode, StickyNoteNode, TextNode, VideoNode } from './ContentNodes'
import { AudioGeneratorNode, ImageGeneratorNode, VideoGeneratorNode } from './GeneratorNodes'
import { GroupNode } from './GroupNode'
import { DirectorNode, PromptGroupNode, ScriptNode, VideoStitchNode } from './StructureNodes'

/**
 * React Flow 的节点注册表。
 * 必须是模块级常量——每次渲染新建对象会让 React Flow 把所有节点重新挂载一遍。
 */
export const nodeTypes: NodeTypes = {
  text: TextNode,
  markdown: MarkdownNode,
  stickyNote: StickyNoteNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  imageGenerator: ImageGeneratorNode,
  videoGenerator: VideoGeneratorNode,
  audioGenerator: AudioGeneratorNode,
  promptGroup: PromptGroupNode,
  director: DirectorNode,
  script: ScriptNode,
  videoStitch: VideoStitchNode,
  group: GroupNode,
}

/** 连线外观：覆盖内置的 default，旧画布里没写 type 的线也会用上 */
export const edgeTypes: EdgeTypes = {
  default: FlowEdge,
}
