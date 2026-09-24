/**
 * 从节点数据拼出一次「运行」要的参数。
 *
 * 节点上的运行按钮和「级联执行」都走这一份，免得两边拼法不一样——
 * 同一个节点单独跑和级联里跑，发出去的请求必须一模一样。
 */

import { getImageSizeOptions } from '@/components/features/create/config/aspectRatioOptions'
import { clampOutputCount, getOutputCountConfig } from '@/components/features/create/config/outputCountOptions'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

import type { CanvasNode } from '../canvasV2.types'
import { BUILTIN_PROMPT_SNIPPETS } from '../data/promptLibrary'
import type { RunOptions } from './useNodeRun'

/** GPT Image / Qwen / 豆包出图用像素尺寸，其余用比例（见 GeneratorNodes 的 useAspectOptions） */
export function aspectKind(provider: string | undefined, mode: 'image' | 'video'): 'size' | 'ratio' {
  return mode === 'image' && getImageSizeOptions(provider)?.length ? 'size' : 'ratio'
}

export function runModeOf(node: CanvasNode): 'image' | 'video' | null {
  if (node.type === 'imageGenerator') return 'image'
  if (node.type === 'videoGenerator') return 'video'
  return null
}

const strOrNull = (value: unknown) => (value ? String(value) : null)

/** 按节点上选的模型 id 找模型对象；找不到（还没选 / 模型被下架）就是 null，run 会报「先选模型」 */
export function buildRunOptions(node: CanvasNode, models: ModelWithCapabilities[]): RunOptions | null {
  const mode = runModeOf(node)
  if (!mode) return null
  const data = node.data ?? {}
  const model = models.find((item) => item.id === String(data.modelId ?? '')) ?? null
  const aspect = data.aspectRatio ? String(data.aspectRatio) : undefined
  const common = {
    nodeId: node.id,
    mode,
    model,
    models,
    prompt: String(data.prompt ?? ''),
    ...(aspectKind(model?.provider, mode) === 'size' ? { sizeOverride: aspect } : { ratioOverride: aspect }),
    outputCount: clampOutputCount(Number(data.outputCount ?? 1), getOutputCountConfig(model?.provider, mode)),
    snippets: BUILTIN_PROMPT_SNIPPETS,
    snippetIds: (data.snippetIds as string[]) ?? [],
  }

  if (mode === 'video') return { ...common, durationSeconds: Number(data.durationSeconds ?? 5) }

  const angleKeys = (data.angleKeys as string[]) ?? []
  return {
    ...common,
    angleKeys,
    shot: {
      angleKeys,
      lightPositionKeys: (data.lightPositionKeys as string[]) ?? [],
      lightColorKey: strOrNull(data.lightColorKey),
      lightBrightnessKey: strOrNull(data.lightBrightnessKey),
      shotSizeKey: strOrNull(data.shotSizeKey),
      cameraHeightKey: strOrNull(data.cameraHeightKey),
    },
  }
}

/** 这个节点跑一次会提交几个任务（生成数量 × 角度数），级联前的确认框要用 */
export function plannedTaskCount(options: RunOptions) {
  const angles = options.angleKeys?.length ? options.angleKeys.length : 1
  return Math.max(1, Math.round(options.outputCount ?? 1)) * angles
}
