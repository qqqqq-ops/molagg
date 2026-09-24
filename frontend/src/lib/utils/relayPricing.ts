/**
 * 站长自己两个中转站的价格（2026-09-23 站长定）。只在「这个用户的渠道地址指向这两个站」时显示。
 *
 * - 生视频：molagg.com 的 seedance-2-5-special，固定 30 秒一条，¥6 / 条（按次，不按秒）。
 * - 生图：沿用 opusapi.xyz 的计费，按画质分档：标准 ¥0.4 / 张、高画质 ¥0.8 / 张（站长 2026-09-23 确认）。
 *   本站生图不带画质参数，走中转站默认画质那一档，所以合计按 0.4 算。改价只改这里。
 *
 * 纯函数，不碰 React，checks 里能直接测。
 */

export const RELAY_PRICING = {
  image: { host: 'opusapi.xyz', provider: 'gptimage', standard: 0.4, high: 0.8 },
  video: { host: 'molagg.com', provider: 'molagg', perClip: 6, seconds: 30 },
} as const

export type RelayPrice =
  | { kind: 'image'; standard: number; high: number }
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
    return { kind: 'image', standard: image.standard, high: image.high }
  }
  if (provider === video.provider && isHostOf(channelBaseUrl, video.host)) {
    return { kind: 'video', perClip: video.perClip, seconds: video.seconds }
  }
  return null
}

/** 这一次一共要花多少（张数 / 条数 × 单价）；生图按本站实际用的默认画质那档算 */
export function estimateRelayCost(price: RelayPrice, count: number) {
  const n = Math.max(1, Math.round(count))
  const unit = price.kind === 'image' ? price.standard : price.perClip
  return Math.round(unit * n * 100) / 100
}

/** ¥6、¥0.4、¥1.2——去掉多余的 0 */
export function formatYuan(value: number) {
  return `¥${Number(value.toFixed(2))}`
}
