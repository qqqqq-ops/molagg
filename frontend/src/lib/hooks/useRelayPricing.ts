'use client'

import { useCallback, useEffect, useState } from 'react'

import { userSettingsService } from '@/lib/api/services/userSettings'
import { relayPriceFor } from '@/lib/utils/relayPricing'

/** 渠道 id → 这个用户实际用的地址；全站共用一份，免得每个生成入口各拉一次 */
let cache: Map<string, string> | null = null
let inflight: Promise<Map<string, string>> | null = null

function loadChannels() {
  if (cache) return Promise.resolve(cache)
  inflight ??= userSettingsService
    .getChannels()
    .then((channels) => {
      cache = new Map(channels.map((channel) => [String(channel.id), channel.baseUrl ?? '']))
      return cache
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** 用户在设置页改了地址之后调一下，价格说明跟着更新 */
export function invalidateRelayPricing() {
  cache = null
}

/**
 * 给生成入口用：传模型进来，是站长的两个中转站就返回价格，否则 null。
 * 读不到渠道（没登录、后台没开）时一律不显示价格，不瞎猜。
 */
export function useRelayPricing() {
  const [channels, setChannels] = useState<Map<string, string> | null>(cache)

  useEffect(() => {
    let cancelled = false
    loadChannels()
      .then((map) => {
        if (!cancelled) setChannels(map)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return useCallback(
    (model: { provider?: string | null; channelId?: string | number | null } | null | undefined) => {
      if (!model || !channels) return null
      return relayPriceFor(model, channels.get(String(model.channelId ?? '')))
    },
    [channels],
  )
}
