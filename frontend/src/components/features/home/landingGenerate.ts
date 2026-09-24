/**
 * 落地页「直接出图」的纯逻辑：选模型、给时长、按厂商拼参数。
 *
 * 只覆盖最常见的一次性生成：一句描述 + 可选参考图 + 张数/时长。
 * 参数名与创作页（SimplifiedCreateContent）的 handleSubmit 保持一致，
 * 时长范围照抄后端各适配器的 validateParams —— 前端给出的选项一定能过后端校验。
 */

import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

import type { LandingMode } from './landingHomePage.shared'

export const LANDING_MAX_IMAGE_COUNT = 4
export const LANDING_MAX_VIDEO_SECONDS = 30
export const LANDING_MAX_REFERENCE_IMAGES = 3

/**
 * 落地页不给比例选择，但比例必须是确定的、能说出口的：
 * 没参考图时图片固定 1:1、视频固定 16:9；有参考图时不传比例，由厂商跟随参考图。
 * 要改比例 / 画质走高级版（创作页）。
 */
export const LANDING_DEFAULT_RATIO: Record<LandingMode, string> = { image: '1:1', video: '16:9' }

export function normalizeProviderFamily(providerValue?: string | null) {
  const normalized = (providerValue || '').toLowerCase().trim()
  if (normalized === 'qianwen') return 'qwen'
  if (normalized === 'mj') return 'midjourney'
  if (normalized === 'wanxiang') return 'wanx'
  return normalized
}

function resolveModelName(model: ModelWithCapabilities) {
  return (model.capabilities?.remoteModel || model.modelKey || '').trim().toLowerCase()
}

function supportsReferenceImage(model: ModelWithCapabilities) {
  const supports = model.capabilities?.supports
  return Boolean(
    model.supportsImageInput ||
      supports?.imageInput ||
      supports?.imageToImage ||
      supports?.multiImageInput,
  )
}

/** 万相 i2v / r2v 没有参考图就提交不了，纯文字时不能出现在候选里。 */
function requiresReferenceImage(model: ModelWithCapabilities) {
  if (!normalizeProviderFamily(model.provider).includes('wanx')) return false
  const name = resolveModelName(model)
  return name.includes('-i2v') || name.includes('-r2v')
}

export function filterLandingModels(models: ModelWithCapabilities[], hasReference: boolean) {
  return models.filter((model) => {
    if (!model.isActive) return false
    if (typeof model.supportsQuickMode === 'boolean' && !model.supportsQuickMode) return false
    return hasReference ? supportsReferenceImage(model) : !requiresReferenceImage(model)
  })
}

export function getMaxReferenceImages(mode: LandingMode, model: ModelWithCapabilities | undefined) {
  if (mode === 'video') return 1
  const limit = model?.capabilities?.limits?.maxInputImages
  if (typeof limit === 'number' && limit > 0) return Math.min(limit, LANDING_MAX_REFERENCE_IMAGES)
  return LANDING_MAX_REFERENCE_IMAGES
}

// 含 8 是因为内置视频样本多是 8 秒，选样本时不能被悄悄改成别的时长
const ROUND_STEPS = [5, 8, 10, 15, 20, 30]

function rangeOptions(min: number, max: number) {
  const options = ROUND_STEPS.filter((value) => value >= min && value <= max)
  return options.length > 0 ? options : [min]
}

/**
 * 每个厂商能接受的时长不一样，全部照抄后端适配器的校验：
 * 可灵 5/10（3.0 为 3–15）、海螺 6/10（H3 为 4–15）、Veo 4–16、Sora 4/8/12/16/20、
 * Vidu 4/5/8、豆包 Seedance 2.5 最长 30、万相 3.0 最长 30。
 */
export function getVideoDurationOptions(model: ModelWithCapabilities | undefined): number[] {
  if (!model) return [5, 10]

  const provider = normalizeProviderFamily(model.provider)
  const name = resolveModelName(model)
  let options: number[]

  if (provider.includes('molagg')) {
    // Molagg 按次 Seedance：固定 30 秒一条
    options = [30]
  } else if (provider.includes('kling')) {
    const isV3 = name.includes('kling-v3') || name.includes('kling-3') || name.includes('omni')
    options = isV3 ? [5, 10, 15] : [5, 10]
  } else if (provider.includes('hailuo') || provider.includes('minimax')) {
    options = name.includes('h3') ? [6, 10, 15] : [6, 10]
  } else if (provider.includes('veo')) {
    options = [4, 6, 8]
  } else if (provider.includes('sora') || provider.includes('openai')) {
    options = [4, 8, 12, 16, 20]
  } else if (provider.includes('vidu')) {
    options = [4, 5, 8]
  } else if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    if (name.includes('seedance-2-5') || name.includes('seedance-2.5')) options = rangeOptions(4, 30)
    else if (name.includes('seedance-2-0')) options = rangeOptions(4, 15)
    else options = [5, 10]
  } else if (provider.includes('wanx')) {
    if (/^wan-?3[.-]0/.test(name)) options = rangeOptions(2, 30)
    else if (name.startsWith('happyhorse')) options = rangeOptions(3, 15)
    else options = rangeOptions(2, 15)
  } else {
    options = [5, 10]
  }

  return options.filter((value) => value <= LANDING_MAX_VIDEO_SECONDS)
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type BuildParametersInput = {
  mode: LandingMode
  model: ModelWithCapabilities
  duration: number
  referenceImages: File[]
  /** 视频参考图要先上传拿 URL 的厂商（万相 / Seedance 2.x）由调用方传入上传函数。 */
  uploadVideoReference: (files: File[], provider: 'seedance' | 'wanx') => Promise<string[]>
  /**
   * 比例 / 尺寸覆盖。落地页不传，用 LANDING_DEFAULT_RATIO（行为不变）；
   * 画布的生成器节点让用户自己选画幅，所以传进来。
   * 用哪个由厂商决定：getImageSizeOptions 有值的走 sizeOverride，否则走 ratioOverride。
   */
  ratioOverride?: string
  sizeOverride?: string
}

export async function buildLandingParameters({
  mode,
  model,
  duration,
  referenceImages,
  uploadVideoReference,
  ratioOverride,
  sizeOverride,
}: BuildParametersInput): Promise<Record<string, unknown>> {
  const provider = normalizeProviderFamily(model.provider)
  const name = resolveModelName(model)
  const remoteModel = model.capabilities?.remoteModel
  const parameters: Record<string, unknown> = {}
  const hasReference = referenceImages.length > 0

  if (mode === 'image') {
    const isDoubao = provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')
    const isGptImage = provider.includes('gpt') || provider.includes('openai')
    const isMidjourney = provider.includes('midjourney')
    const isNanoBananaFamily =
      provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')

    if (!hasReference) {
      // 各家比例参数的格式不同，照 create/config/aspectRatioOptions.ts 的写法
      if (isGptImage) parameters.size = sizeOverride || '1024x1024'
      else if (provider.includes('qwen')) parameters.size = sizeOverride || '1024*1024'
      else if (!isDoubao) parameters.aspectRatio = ratioOverride || LANDING_DEFAULT_RATIO.image
    }

    if (provider.includes('qwen')) {
      parameters.n = 1
      parameters.watermark = false
      if (remoteModel) parameters.model = remoteModel
    } else if (isGptImage) {
      parameters.gptImageOperation = hasReference ? 'edits' : 'generations'
      parameters.model = remoteModel || 'gpt-image-2-all'
    } else if (isDoubao) {
      // 豆包图片没有比例参数，只能用像素尺寸把方图定下来；有参考图时仍用 2K 让它跟随参考图
      parameters.size = hasReference ? '2K' : sizeOverride || '2048x2048'
      parameters.response_format = 'url'
      parameters.watermark = false
      if (remoteModel) parameters.model = remoteModel
    } else if (isMidjourney) {
      parameters.botType = 'MID_JOURNEY'
    } else if (isNanoBananaFamily) {
      parameters.responseModalities = ['IMAGE']
    }

    if (hasReference) {
      const images = await Promise.all(referenceImages.map(fileToDataUrl))
      if (isMidjourney) {
        parameters.base64Array = images.map((item) => (item.includes(',') ? item.split(',')[1] : item))
      } else if (provider.includes('qwen')) {
        parameters.images = images
      } else if (isGptImage) {
        if (images.length === 1) parameters.image = images[0]
        else parameters.images = images
      } else if (isDoubao) {
        parameters.image = images.length === 1 ? images[0] : images
      } else if (isNanoBananaFamily) {
        parameters.images = images
        parameters.imageFirst = true
      } else {
        parameters.imageBase64 = images[0]
      }
    }

    return parameters
  }

  parameters.duration = duration

  const isDoubaoVideo = provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')
  const isWanx = provider.includes('wanx')
  const isSeedance2x = isDoubaoVideo && (name.includes('seedance-2-0') || name.includes('seedance-2-5'))

  if (isWanx) {
    parameters.resolution = '720P'
    if (remoteModel) parameters.model = remoteModel
  } else if (isDoubaoVideo) {
    parameters.resolution = '720p'
    parameters.watermark = false
    if (remoteModel) parameters.model = remoteModel
  }

  if (!hasReference) {
    // 海螺的接口没有比例参数，默认就是横屏
    if (provider.includes('sora') || provider.includes('openai')) parameters.size = sizeOverride || '1280x720'
    else if (!provider.includes('hailuo') && !provider.includes('minimax'))
      parameters.ratio = ratioOverride || LANDING_DEFAULT_RATIO.video
    return parameters
  }

  if (isWanx) {
    const urls = await uploadVideoReference(referenceImages, 'wanx')
    if (name.includes('-i2v')) parameters.firstFrame = urls[0]
    else parameters.referenceImages = urls
  } else if (isSeedance2x) {
    parameters.referenceImages = await uploadVideoReference(referenceImages, 'seedance')
  } else {
    parameters.referenceImages = await Promise.all(referenceImages.map(fileToDataUrl))
  }

  return parameters
}
