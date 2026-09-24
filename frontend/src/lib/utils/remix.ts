/**
 * 「做同款」参数在画廊页和创作页之间的传递与归一。
 * 两侧共用这里的键名，避免任一侧改动后静默失配。
 */

import type { ApiTask } from '@/lib/api/types'

export const REMIX_PARAMS = {
  mode: 'mode',
  prompt: 'prompt',
  model: 'model',
  negativePrompt: 'negative',
  aspectRatio: 'ar',
  imageSize: 'imageSize',
  videoDuration: 'duration',
  videoResolution: 'resolution',
  from: 'from',
} as const

export type RemixPayload = {
  mode: 'image' | 'video' | null
  prompt: string | null
  modelId: string | null
  negativePrompt: string | null
  aspectRatio: string | null
  imageSize: string | null
  videoDuration: string | null
  videoResolution: string | null
  fromTaskId: string | null
}

const RESOLUTION_TIER_PATTERN = /^\d+k$/i

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

/**
 * 同一个概念在各 provider 下键名不同：
 * 画面比例可能落在 aspectRatio / ratio / size，图片尺寸可能落在 imageSize / size。
 *
 * `size` 尤其含混：豆包图片放的是 "2K" / "4K" 这类清晰度档，
 * 而 Qwen 和 GPT Image 放的是创作页「画面比例」那一栏的值（"16:9" / "1024x1024"）。
 * 因此按值的形态判定归属，不依赖 provider 判断。
 */
export function extractRemixParameters(task: ApiTask) {
  const parameters = (task.parameters ?? {}) as Record<string, unknown>
  const size = asText(parameters.size)
  const sizeIsResolutionTier = Boolean(size && RESOLUTION_TIER_PATTERN.test(size))

  return {
    aspectRatio:
      asText(parameters.aspectRatio) ??
      asText(parameters.ratio) ??
      (size && !sizeIsResolutionTier ? size : null),
    imageSize: asText(parameters.imageSize) ?? (sizeIsResolutionTier ? size : null),
    videoDuration: asText(parameters.duration),
    videoResolution: asText(parameters.resolution),
  }
}

export function buildRemixHref(locale: string, task: ApiTask) {
  const search = new URLSearchParams()
  const extracted = extractRemixParameters(task)

  search.set(REMIX_PARAMS.mode, task.type)
  search.set(REMIX_PARAMS.from, task.id)

  if (task.modelId) search.set(REMIX_PARAMS.model, task.modelId)

  const prompt = asText(task.prompt)
  if (prompt) search.set(REMIX_PARAMS.prompt, prompt)

  const negativePrompt = asText(task.negativePrompt)
  if (negativePrompt) search.set(REMIX_PARAMS.negativePrompt, negativePrompt)

  if (extracted.aspectRatio) search.set(REMIX_PARAMS.aspectRatio, extracted.aspectRatio)
  if (extracted.imageSize) search.set(REMIX_PARAMS.imageSize, extracted.imageSize)
  if (extracted.videoDuration) search.set(REMIX_PARAMS.videoDuration, extracted.videoDuration)
  if (extracted.videoResolution) search.set(REMIX_PARAMS.videoResolution, extracted.videoResolution)

  return `/${locale}/create?${search.toString()}`
}

export function readRemixPayload(searchParams: URLSearchParams): RemixPayload {
  const mode = searchParams.get(REMIX_PARAMS.mode)

  return {
    mode: mode === 'image' || mode === 'video' ? mode : null,
    prompt: asText(searchParams.get(REMIX_PARAMS.prompt)),
    modelId: asText(searchParams.get(REMIX_PARAMS.model)),
    negativePrompt: asText(searchParams.get(REMIX_PARAMS.negativePrompt)),
    aspectRatio: asText(searchParams.get(REMIX_PARAMS.aspectRatio)),
    imageSize: asText(searchParams.get(REMIX_PARAMS.imageSize)),
    videoDuration: asText(searchParams.get(REMIX_PARAMS.videoDuration)),
    videoResolution: asText(searchParams.get(REMIX_PARAMS.videoResolution)),
    fromTaskId: asText(searchParams.get(REMIX_PARAMS.from)),
  }
}
