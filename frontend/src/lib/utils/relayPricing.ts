/**
 * 站长自己两个中转站的价格（2026-09-23 站长定）。只在「这个用户的渠道地址指向这两个站」时显示。
 *
 * - 生视频：molagg.com 的 seedance-2-5-special，固定 30 秒一条，¥6 / 条（按次，不按秒）。
 * - 生图：沿用 opusapi.xyz 的计费，两档：通用 gpt-image-2 ¥0.4 / 张、「写实增强」gpt-image-2-adobe ¥0.8 / 张
 *   （站长 2026-09-24 确认：写实增强就是 0.8；opusapi 按模型收费，quality 参数不影响价格）。
 *   不指定档位的地方按通用档算。改价只改这里。
 *
 * 纯函数，不碰 React，checks 里能直接测。
 */

export const RELAY_PRICING = {
  image: { host: 'opusapi.xyz', provider: 'gptimage', standard: 0.4, realistic: 0.8, realisticModel: 'gpt-image-2-adobe' },
  video: { host: 'molagg.com', provider: 'molagg', perClip: 6, seconds: 30 },
} as const

export type RelayPrice =
  | { kind: 'image'; standard: number; realistic: number }
  | { kind: 'video'; perClip: number; seconds: number }

/** 地址的主机名是这个站，或者它的子域名（api.opusapi.xyz 也算 opusapi.xyz） */
export function isHostOf(url: string | null | undefined, host: string) {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === host || hostname.endsWith(`.${host}`)
  } catch {
    return false
  }
}

/** 这个模型、走这个渠道地址时的价格；不是站长的两个站就返回 null（不显示价格） */
export function relayPriceFor(
  model: { provider?: string | null } | null | undefined,
  channelBaseUrl: string | null | undefined,
): RelayPrice | null {
  const provider = (model?.provider ?? '').toLowerCase()
  const { image, video } = RELAY_PRICING
  if (provider === image.provider && isHostOf(channelBaseUrl, image.host)) {
    return { kind: 'image', standard: image.standard, realistic: image.realistic }
  }
  if (provider === video.provider && isHostOf(channelBaseUrl, video.host)) {
    return { kind: 'video', perClip: video.perClip, seconds: video.seconds }
  }
  return null
}

/** 生图档位：通用（gpt-image-2）/ 写实增强（gpt-image-2-adobe） */
export type ImageTier = 'standard' | 'realistic'

/** 这一次一共要花多少（张数 / 条数 × 单价）；生图不指定档位时按通用档算 */
export function estimateRelayCost(price: RelayPrice, count: number, tier: ImageTier = 'standard') {
  const n = Math.max(1, Math.round(count))
  const unit = price.kind === 'image' ? price[tier] : price.perClip
  return Math.round(unit * n * 100) / 100
}

/** ¥6、¥0.4、¥1.2——去掉多余的 0 */
export function formatYuan(value: number) {
  return `¥${Number(value.toFixed(2))}`
}
