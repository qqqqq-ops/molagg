'use client'

import { useTranslations } from '@/i18n/client'
import { estimateRelayCost, formatYuan, type RelayPrice } from '@/lib/utils/relayPricing'
import { cn } from '@/lib/utils/cn'

/**
 * 生成按钮旁边的一行价格说明。只有走站长两个中转站时才有 price（见 useRelayPricing），否则不渲染。
 * count = 这一次会出几张 / 几条；大于 1 时顺带算出合计。
 */
export function RelayPriceNote({
  price,
  count = 1,
  className,
}: {
  price: RelayPrice | null
  count?: number
  className?: string
}) {
  const t = useTranslations('common.relayPricing')
  if (!price) return null
  const n = Math.max(1, Math.round(count))
  const total = formatYuan(estimateRelayCost(price, n))

  const text =
    price.kind === 'image'
      ? t('image', { standard: formatYuan(price.standard), high: formatYuan(price.high) }) +
        (n > 1 ? t('imageTotal', { count: n, total }) : '')
      : t('video', { seconds: price.seconds, price: formatYuan(price.perClip) }) +
        (n > 1 ? t('videoTotal', { count: n, total }) : '')

  return <p className={cn('relay-price-note', className)}>{text}</p>
}
