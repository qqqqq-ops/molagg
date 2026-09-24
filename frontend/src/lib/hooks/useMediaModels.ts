'use client'

import { useEffect, useState } from 'react'

import { modelService } from '@/lib/api/services'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

/**
 * 按类型取模型列表，全站共用一份缓存。
 * 画布上每个生成器节点、创作页的「生成这一帧」弹窗都要用；
 * 不缓存的话放十个节点就发十次请求。
 */
type MediaModelType = 'image' | 'video'

const cache = new Map<MediaModelType, ModelWithCapabilities[]>()
const inflight = new Map<MediaModelType, Promise<ModelWithCapabilities[]>>()

function fetchModels(type: MediaModelType): Promise<ModelWithCapabilities[]> {
  const cached = cache.get(type)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(type)
  if (pending) return pending

  const request = modelService
    .getModelsWithCapabilities({ type })
    .then((models) => {
      cache.set(type, models)
      return models
    })
    .finally(() => inflight.delete(type))

  inflight.set(type, request)
  return request
}

type Loaded = { type: MediaModelType; models: ModelWithCapabilities[] }

export function useMediaModels(type: MediaModelType) {
  // 只在请求回来后写一次 state；type 变了但还没拉到的那一帧走下面的派生值，
  // 这样 effect 里不需要同步 setState（会触发级联渲染）。
  const [loaded, setLoaded] = useState<Loaded | null>(() =>
    cache.has(type) ? { type, models: cache.get(type)! } : null,
  )

  useEffect(() => {
    let cancelled = false
    fetchModels(type)
      .then((models) => {
        if (!cancelled) setLoaded({ type, models })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ type, models: [] })
      })
    return () => {
      cancelled = true
    }
  }, [type])

  // 手里这份不是当前 type 的（刚切过来），先用缓存顶上，没缓存就算作加载中
  const fresh = loaded?.type === type ? loaded : null
  const models = fresh?.models ?? cache.get(type) ?? []
  const loading = !fresh && !cache.has(type)

  return { models, loading }
}

/** 换了渠道 / 加了模型之后手动失效 */
export function invalidateMediaModels() {
  cache.clear()
}
