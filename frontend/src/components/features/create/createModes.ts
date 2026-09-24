/**
 * 创作页的两种模式（照参考站 creative-studio：「首尾帧模式 / 参考模式」）。
 *
 * 整页围绕**视频生成**：两种模式最后都提交视频任务，区别只在给模型什么输入。
 * 图片模型不再是独立的一档，而是收进首尾帧模式里的「生成这一帧」。
 *
 * 注意：首尾帧 / 参考这个区分在提交逻辑里本来就有
 * （`doubaoFrameImages` vs `doubaoReferenceImages`、万相的 `firstFrame/lastFrame` vs `referenceImages`），
 * 这里只是把它提到页面顶层当主模式，不是新造一套管道。
 */

import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

export type CreateMode = 'frames' | 'references'

export const CREATE_MODES: { key: CreateMode; label: string; description: string }[] = [
  { key: 'frames', label: '首尾帧创作', description: '支持纯提示词、首帧或首尾帧控制' },
  { key: 'references', label: '参考创作', description: '参考图片、视频与音频可组合使用' },
]

/** 万相那套命名：t2v 纯文生视频、i2v 图生视频（首帧）、r2v 参考生视频 */
export type VideoModelKind = 't2v' | 'i2v' | 'r2v'

function normalize(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function modelName(model: Pick<ModelWithCapabilities, 'modelKey' | 'capabilities'>) {
  return normalize(model.capabilities?.remoteModel || model.modelKey)
}

/** 从模型名里读出 t2v / i2v / r2v；读不出返回 null */
export function resolveVideoModelKind(name: string): VideoModelKind | null {
  if (name.includes('-t2v')) return 't2v'
  if (name.includes('-i2v')) return 'i2v'
  if (name.includes('-r2v')) return 'r2v'
  return null
}

/**
 * 这个模型支持哪些模式。
 * 名字里带 t2v/i2v/r2v 的（万相、happyhorse）按名字走；
 * 其余厂商看 provider：Seedance 2.x 两种都行，其他家只有首尾帧（给首帧或纯提示词）。
 */
export function getModelModes(model: ModelWithCapabilities): CreateMode[] {
  const name = modelName(model)
  const kind = resolveVideoModelKind(name)
  if (kind === 'r2v') return ['references']
  // t2v 纯提示词、i2v 首帧，都归首尾帧模式
  if (kind === 't2v' || kind === 'i2v') return ['frames']

  const provider = normalize(model.provider)
  const isSeedance2x =
    (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) &&
    (name.includes('seedance-2-0') || name.includes('seedance-2-5'))
  // Seedance 2.x 既吃首尾帧也吃参考素材（提交逻辑里 hasDoubaoSeedance20FrameInputs 就是在二选一）
  if (isSeedance2x) return ['frames', 'references']

  // 可灵 / Sora / Veo / 海螺 / Vidu：只有首帧，没有参考素材通道
  return ['frames']
}

export function filterModelsByMode(models: ModelWithCapabilities[], mode: CreateMode) {
  return models.filter((model) => model.isActive !== false && getModelModes(model).includes(mode))
}

/** 这个模型在这个模式下，能不能收尾帧（只有首帧的模型不显示尾帧槽位） */
export function supportsLastFrame(model: ModelWithCapabilities | null | undefined) {
  if (!model) return false
  const name = modelName(model)
  const provider = normalize(model.provider)
  // 万相 2.7 的 i2v 支持首尾帧；happyhorse 只有首帧
  if (provider.includes('wanx')) return name.includes('wan2.7') && resolveVideoModelKind(name) === 'i2v'
  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return name.includes('seedance-2-0') || name.includes('seedance-2-5')
  }
  // 其余厂商没有尾帧参数
  return false
}

/** 参考模式下能不能同时收视频 / 音频素材 */
export function supportsReferenceMedia(model: ModelWithCapabilities | null | undefined) {
  if (!model) return { video: false, audio: false }
  const name = modelName(model)
  const provider = normalize(model.provider)
  if (provider.includes('wanx')) {
    // happyhorse 不吃参考视频（提交逻辑里 isWanxHappyhorseVideo 时跳过 referenceVideos）
    const isHappyhorse = name.includes('happyhorse')
    return { video: !isHappyhorse, audio: true }
  }
  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return { video: true, audio: true }
  }
  return { video: false, audio: false }
}

/** 切模式后原来选的模型可能不支持新模式，这里挑一个能用的 */
export function pickModelForMode(
  models: ModelWithCapabilities[],
  mode: CreateMode,
  currentId: string,
): string {
  const usable = filterModelsByMode(models, mode)
  if (usable.some((model) => model.id === currentId)) return currentId
  return usable[0]?.id ?? ''
}
