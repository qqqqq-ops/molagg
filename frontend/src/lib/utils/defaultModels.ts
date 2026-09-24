/**
 * 默认模型：图片优先 GPT Image 2，视频优先 Seedance 2.5（用户指定）。
 * 按 modelKey / remoteModel / 名称做包含匹配；没配这个模型时退回列表第一个，不会选不到。
 */

type ModelLike = {
  id: string
  modelKey?: string | null
  name?: string | null
  capabilities?: { remoteModel?: string | null } | null
}

const PREFERRED_MODEL_NEEDLES: Record<'image' | 'video', string[]> = {
  image: ['gpt-image-2', 'gpt image 2'],
  video: ['seedance-2-5', 'seedance-2.5', 'seedance 2.5'],
}

export function pickDefaultModelId<T extends ModelLike>(models: T[], type: 'image' | 'video'): string {
  const needles = PREFERRED_MODEL_NEEDLES[type]
  const preferred = models.find((model) => {
    const haystack = `${model.modelKey ?? ''} ${model.capabilities?.remoteModel ?? ''} ${model.name ?? ''}`.toLowerCase()
    return needles.some((needle) => haystack.includes(needle))
  })
  return (preferred ?? models[0])?.id ?? ''
}
