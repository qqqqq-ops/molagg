'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { imageService, videoService } from '@/lib/api/services'
import type { ApiTask } from '@/lib/api/types'
import { upsertTaskInTasksViewCache } from '@/lib/cache/viewCache'
import { classifyFailureMessage, type Failure } from '@/lib/utils/failure'

/**
 * 「提交后就地看结果」的公共部分：占位 → 拿到任务 → 只轮询自己这一批 → 出结果或失败。
 * 落地页（就地生成）和创作页（右栏结果）共用，界面各自渲染。
 */

export type TrackedJobMode = 'image' | 'video'
export type TrackedJobStatus = 'submitting' | 'pending' | 'processing' | 'completed' | 'failed'

export type TrackedJob = {
  key: string
  mode: TrackedJobMode
  taskId: string | null
  status: TrackedJobStatus
  resultUrl: string | null
  thumbnailUrl: string | null
  failure: Failure | null
  /** 进度用：拿到任务后才有（占位阶段为 null） */
  createdAt: string | null
  modelId: string | null
  progress: number | null
}

const POLL_INTERVAL_MS: Record<TrackedJobMode, number> = { image: 3000, video: 5000 }

function applyTask(job: TrackedJob, task: ApiTask): TrackedJob {
  // 上游说完成了却没给文件，界面上不能一直挂着「排队中」
  const progressFields = { createdAt: task.createdAt, modelId: task.modelId, progress: task.progress ?? null }
  if (task.status === 'completed' && !task.resultUrl) {
    return { ...job, ...progressFields, taskId: task.id, status: 'failed', failure: classifyFailureMessage(task.errorMessage) }
  }

  return {
    ...job,
    ...progressFields,
    taskId: task.id,
    status: task.status,
    resultUrl: task.resultUrl,
    thumbnailUrl: task.thumbnailUrl,
    failure: task.status === 'failed' ? classifyFailureMessage(task.errorMessage) : null,
  }
}

function isActive(job: TrackedJob) {
  return job.taskId !== null && (job.status === 'pending' || job.status === 'processing')
}

let jobSeq = 0

export function useTrackedTasks(userId: string | null) {
  const [jobs, setJobs] = useState<TrackedJob[]>([])
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const hasActiveJobs = jobs.some(isActive)

  useEffect(() => {
    if (!hasActiveJobs) return

    let cancelled = false
    const tick = async () => {
      const active = jobsRef.current.filter(isActive)
      const results = await Promise.allSettled(
        active.map((job) =>
          (job.mode === 'image' ? imageService.getTask(job.taskId!) : videoService.getTask(job.taskId!)).then(
            (task) => [job.key, task] as const,
          ),
        ),
      )
      if (cancelled) return

      const updates = new Map<string, ApiTask>()
      results.forEach((result) => {
        if (result.status === 'fulfilled') updates.set(result.value[0], result.value[1])
      })
      if (updates.size === 0) return

      setJobs((prev) => prev.map((job) => (updates.has(job.key) ? applyTask(job, updates.get(job.key)!) : job)))
      updates.forEach((task) => upsertTaskInTasksViewCache(userId, task))
    }

    const intervalMs = Math.min(...jobsRef.current.filter(isActive).map((job) => POLL_INTERVAL_MS[job.mode]))
    const timer = window.setInterval(() => void tick(), intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [hasActiveJobs, userId])

  /** 先占位，界面立刻出现「提交中」的卡片；返回每个占位的 key */
  const addPlaceholders = useCallback((mode: TrackedJobMode, count: number) => {
    const placeholders: TrackedJob[] = Array.from({ length: count }, () => ({
      key: `job-${Date.now()}-${jobSeq++}`,
      mode,
      taskId: null,
      status: 'submitting',
      resultUrl: null,
      thumbnailUrl: null,
      failure: null,
      createdAt: null,
      modelId: null,
      progress: null,
    }))
    setJobs((prev) => [...placeholders, ...prev])
    return placeholders.map((job) => job.key)
  }, [])

  const resolveJob = useCallback(
    (key: string, task: ApiTask) => {
      upsertTaskInTasksViewCache(userId, task)
      setJobs((prev) => prev.map((job) => (job.key === key ? applyTask(job, task) : job)))
    },
    [userId],
  )

  const failJobs = useCallback((keys: string[], failure: Failure) => {
    const set = new Set(keys)
    setJobs((prev) => prev.map((job) => (set.has(job.key) ? { ...job, status: 'failed', failure } : job)))
  }, [])

  /** 只清掉已结束的；还在跑的留着，否则结果回来没地方放 */
  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((job) => job.status === 'submitting' || isActive(job)))
  }, [])

  return { jobs, addPlaceholders, resolveJob, failJobs, clearFinished }
}
