/**
 * 无限画布 v2 的节点数据模型。
 *
 * 画布文件就是 `{ version, nodes, edges }`（React Flow 原生结构），
 * 导出成 JSON 可以备份 / 分享，导入时按 version 校验。
 */

import type { Edge, Node } from '@xyflow/react'

/** 画布文件格式版本；不兼容的改动才升，加字段不算 */
export const CANVAS_FILE_VERSION = 1

export type CanvasNodeKind =
  // 内容
  | 'text'
  | 'markdown'
  | 'stickyNote'
  | 'image'
  | 'video'
  | 'audio'
  // 生成器
  | 'imageGenerator'
  | 'videoGenerator'
  | 'audioGenerator'
  // 结构
  | 'promptGroup'
  | 'director'
  | 'script'
  | 'videoStitch'
  // 分组：React Flow 的父节点，组员带 parentId
  | 'group'

/** 生成类节点的运行状态，和任务队列那边的状态对齐 */
export type NodeRunStatus = 'idle' | 'submitting' | 'pending' | 'processing' | 'completed' | 'failed'

type BaseNodeData = {
  /** 节点标题，用户可改；空则界面上显示类型默认名 */
  title?: string
}

export type TextNodeData = BaseNodeData & { text: string }
export type MarkdownNodeData = BaseNodeData & { markdown: string }
export type StickyNoteNodeData = BaseNodeData & { text: string; color: string }

/** 图片 / 视频 / 音频这三种「素材节点」：要么是用户拖进来的，要么是生成器产出的 */
export type MediaNodeData = BaseNodeData & {
  url: string | null
  thumbnailUrl?: string | null
  /** 来自哪个任务；用户自己拖进来的没有 */
  taskId?: string | null
  /** 视频截帧出来的图片会带上源视频，方便回溯 */
  sourceNodeId?: string | null
}

/** 生成器节点共有的部分 */
type GeneratorNodeData = BaseNodeData & {
  prompt: string
  negativePrompt?: string
  /** Molagg 的 AI 模型 id（数字字符串），对应 ai_models.id */
  modelId: string | null
  /** 指定渠道；null = 按系统策略自动路由 */
  channelId: string | null
  /** 勾选的素材库条目 id */
  snippetIds: string[]
  status: NodeRunStatus
  taskId: string | null
  errorMessage: string | null
  /** 真实进度 0–100，上游没给则为 null，界面退回按历史耗时估算 */
  progress: number | null
  /** 任务创建时间，估算进度要用 */
  startedAt: string | null
  /** 一次生成几条：同一份输入跑几遍，每遍一个独立任务。可选范围按模型给 */
  outputCount: number
}

export type ImageGeneratorNodeData = GeneratorNodeData & {
  aspectRatio: string
  /** 多角度生成：勾了哪些角度就出哪几张 */
  angleKeys: string[]
  lightingPresetKey: string | null
  lightPositionKeys: string[]
  lightColorKey: string | null
  lightBrightnessKey: string | null
  shotSizeKey: string | null
  cameraHeightKey: string | null
}

export type VideoGeneratorNodeData = GeneratorNodeData & {
  aspectRatio: string
  durationSeconds: number
  /** 首帧 / 尾帧图片节点的 id（图生视频用） */
  startFrameNodeId: string | null
  endFrameNodeId: string | null
}

export type AudioGeneratorNodeData = GeneratorNodeData & {
  /** 音色库里的音色 id */
  voiceId: string | null
  text: string
}

export type PromptGroupNodeData = BaseNodeData & {
  /** 这一组勾了哪些素材，供下游生成器引用 */
  snippetIds: string[]
}

export type DirectorNodeData = BaseNodeData & {
  /** 导演台：故事主题 / 大纲，产出分镜脚本 */
  theme: string
  outline: string
}

export type ScriptNodeData = BaseNodeData & { script: string }

export type VideoStitchNodeData = BaseNodeData & {
  /** 按顺序拼接的视频节点 id */
  clipNodeIds: string[]
  resultUrl: string | null
  status: NodeRunStatus
}

export type GroupNodeData = BaseNodeData & {
  collapsed: boolean
  /** 折叠前的高度，展开时恢复 */
  expandedHeight?: number
}

export type CanvasNodeData =
  | TextNodeData
  | MarkdownNodeData
  | StickyNoteNodeData
  | MediaNodeData
  | ImageGeneratorNodeData
  | VideoGeneratorNodeData
  | AudioGeneratorNodeData
  | PromptGroupNodeData
  | DirectorNodeData
  | ScriptNodeData
  | VideoStitchNodeData
  | GroupNodeData

export type CanvasNode = Node<Record<string, unknown>, CanvasNodeKind>
export type CanvasEdge = Edge

/** 导出 / 导入的画布文件 */
export type CanvasProjectFile = {
  version: number
  /** 存一下是哪个站导出的，导入别家文件时好报错 */
  app: 'molagg-canvas-v2'
  name?: string
  exportedAt: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/* 节点类型名在 i18n 里（canvas.nodeKinds.<kind>）——新建的节点不写死标题，
   由节点组件按当前语言兜底显示，这样切语言时没改过标题的节点会跟着变。 */

/** 便利贴的几个预设颜色 */
export const STICKY_COLORS = ['#d99b45', '#7f9d6e', '#6e8bad', '#ad6e8b', '#8b8b8b'] as const
