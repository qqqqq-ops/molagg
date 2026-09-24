'use client'

import { useTranslations } from '@/i18n/client'
import { estimateRelayCost, formatYuan, type ImageTier, type RelayPrice } from '@/lib/utils/relayPricing'
import { cn } from '@/lib/utils/cn'

/**
 * 生成按钮旁边的一行价格说明。只有走站长两个中转站时才有 price（见 useRelayPricing），否则不渲染。
 * count = 这一次会出几张 / 几条；大于 1 时顺带算出合计。
 * imageTier：界面上让用户选了档位（首页的「通用 / 写实增强」）时传，只报这一档的价；不传就把两档都列出来。
 */
export function RelayPriceNote({
  price,
  count = 1,
  imageTier,
  className,
}: {
  price: RelayPrice | null
  count?: number
  imageTier?: ImageTier
  className?: string
}) {
  const t = useTranslations('common.relayPricing')
  if (!price) return null
  const n = Math.max(1, Math.round(count))
  const total = formatYuan(estimateRelayCost(price, n, imageTier))

  let text: string
  if (price.kind === 'image') {
    const base = !imageTier
      ? t('image', { standard: formatYuan(price.standard), realistic: formatYuan(price.realistic) })
      : imageTier === 'realistic'
        ? t('imageRealistic', { price: formatYuan(price.realistic) })
        : t('imageStandard', { price: formatYuan(price.standard) })
    text = base + (n > 1 ? t('imageTotal', { count: n, total }) : '')
  } else {
    text =
      t('video', { seconds: price.seconds, price: formatYuan(price.perClip) }) +
      (n > 1 ? t('videoTotal', { count: n, total }) : '')
  }

  return <p className={cn('relay-price-note', className)}>{text}</p>
}
