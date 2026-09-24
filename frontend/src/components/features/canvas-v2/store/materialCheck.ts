/**
 * 连进生成器的素材，当前模型收不收。
 *
 * 规矩（用户原话）：模型不支持的素材**不冲掉**，点生成时直接报错。
 * 所以这里只判断、只给建议，**从不替用户改模型**——建议的模型要用户自己点了才换。
 * 判定规则复用创作页的 findAssetIssue（先报「不支持」，再报「超数量」）。
 */

import { findAssetIssue, type AssetCheck, type AssetIssue } from '@/components/features/create/assetCompatibility'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

export type MaterialCounts = { images: number; videos: number; audios: number }

/** 跟 landingGenerate 的 supportsReferenceImage 同一口径：几个字段任一为真就算收参考图 */
function acceptsImages(model: ModelWithCapabilities) {
  const supports = model.capabilities?.supports
  return Boolean(
    model.supportsImageInput || supports?.imageInput || supports?.imageToImage || supports?.multiImageInput,
  )
}

export function findMaterialIssue(model: ModelWithCapabilities, counts: MaterialCounts): AssetIssue | null {
  const limits = model.capabilities?.limits ?? {}
  const supports = model.capabilities?.supports
  const checks: AssetCheck[] = [
    { kind: 'image', count: counts.images, supported: acceptsImages(model), max: limits.maxInputImages },
    { kind: 'video', count: counts.videos, supported: Boolean(supports?.videoInput), max: limits.maxInputVideos },
    { kind: 'audio', count: counts.audios, supported: Boolean(supports?.audioInput), max: limits.maxInputAudios },
  ]
  return findAssetIssue(checks)
}

/** 在同类模型里找第一个能收下这些素材的（按后台排序），找不到返回 null */
export function suggestModel(
  models: ModelWithCapabilities[],
  counts: MaterialCounts,
  excludeId: string | null,
): ModelWithCapabilities | null {
  const candidates = models
    .filter((model) => model.isActive !== false && model.id !== excludeId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return candidates.find((model) => findMaterialIssue(model, counts) === null) ?? null
}
