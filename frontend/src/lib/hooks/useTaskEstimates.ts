'use client'

import { useEffect, useState } from 'react'

import { tasksService } from '@/lib/api/services'
import type { TaskDurationEstimateMap } from '@/lib/utils/taskProgress'

/** 各模型的历史耗时中位数：全站共用一份，5 分钟内不重复请求 */
const CACHE_TTL_MS = 5 * 60 * 1000

let cached: { value: TaskDurationEstimateMap; fetchedAt: number } | null = null
let inflight: Promise<TaskDurationEstimateMap> | null = null

function fetchEstimates() {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return Promise.resolve(cached.value)
  if (!inflight) {
    inflight = tasksService
      .getDurationEstimates()
      .then((result) => {
        cached = { value: result.models ?? {}, fetchedAt: Date.now() }
        return cached.value
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** enabled = 有进行中的任务时才拉；拉不到就返回 null，进度退回按类型的默认时长估算 */
export function useTaskEstimates(enabled: boolean) {
  const [estimates, setEstimates] = useState<TaskDurationEstimateMap | null>(cached?.value ?? null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchEstimates()
      .then((value) => {
        if (!cancelled) setEstimates(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled])

  return estimates
}
