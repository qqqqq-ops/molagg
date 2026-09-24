'use client'

import { useCallback, useEffect, useState } from 'react'

import { imageService, modelService, videoService } from '@/lib/api/services'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { useTrackedTasks, type TrackedJob } from '@/lib/hooks/useTrackedTasks'
import { classifyFailure } from '@/lib/utils/failure'

import { buildLandingParameters } from './landingGenerate'
import type { LandingMode } from './landingHomePage.shared'

export type LandingJob = TrackedJob

type SubmitInput = {
  mode: LandingMode
  prompt: string
  model: ModelWithCapabilities
  count: number
  duration: number
  referenceImages: File[]
  /** GPT Image：像素尺寸（比例）和上游模型（写实增强），首页选了才有 */
  size?: string
  gptImageModel?: string
}

export function useLandingGeneration({ mode, userId }: { mode: LandingMode; userId: string | null }) {
  const [models, setModels] = useState<ModelWithCapabilities[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsReloadToken, setModelsReloadToken] = useState(0)
  const { jobs, addPlaceholders, resolveJob, failJobs, clearFinished } = useTrackedTasks(userId)

  useEffect(() => {
    if (!userId) {
      setModels([])
      return
    }

    let cancelled = false
    // 切图片/视频时先清空，否则新列表回来前还能用旧模式的模型提交到另一条接口
    setModels([])
    setModelsLoading(true)
    modelService
      .getModelsWithCapabilities({ type: mode })
      .then((data) => {
        if (!cancelled) setModels(data)
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mode, userId, modelsReloadToken])

  const submit = useCallback(
    async ({ mode: jobMode, prompt, model, count, duration, referenceImages, size, gptImageModel }: SubmitInput) => {
      const keys = addPlaceholders(jobMode, jobMode === 'image' ? count : 1)

      let parameters: Record<string, unknown>
      try {
        parameters = await buildLandingParameters({
          mode: jobMode,
          model,
          duration,
          referenceImages,
          sizeOverride: size,
          gptImageModelOverride: gptImageModel,
          uploadVideoReference: async (files, provider) => {
            const result = await videoService.uploadSeedanceInputs('image', files, provider)
            return result.files.map((file) => file.url)
          },
        })
      } catch (error) {
        failJobs(keys, classifyFailure(error))
        return
      }

      const request = {
        modelId: model.id,
        prompt,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      }

      // 图片厂商一次只出一张，多张就是并发提交多个任务
      await Promise.all(
        keys.map(async (key) => {
          try {
            const task =
              jobMode === 'image' ? await imageService.generate(request) : await videoService.generate(request)
            resolveJob(key, task)
          } catch (error) {
            failJobs([key], classifyFailure(error))
          }
        }),
      )
    },
    [addPlaceholders, failJobs, resolveJob],
  )

  const reloadModels = useCallback(() => setModelsReloadToken((token) => token + 1), [])

  return { models, modelsLoading, reloadModels, jobs, submit, clearJobs: clearFinished }
}
