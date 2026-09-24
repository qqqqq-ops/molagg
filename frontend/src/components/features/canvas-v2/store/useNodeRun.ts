'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { buildLandingParameters } from '@/components/features/home/landingGenerate'
import { imageService, videoService } from '@/lib/api/services'
import type { ApiTask } from '@/lib/api/types'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { useTranslations } from '@/i18n/client'
import { classifyFailureMessage } from '@/lib/utils/failure'
import { urlToFile } from '@/lib/utils/urlToFile'

import type { CanvasNode } from '../canvasV2.types'
import { composeSnippetPrompt, type PromptSnippet } from '../data/promptLibrary'
import {
  CAMERA_HEIGHTS,
  CHARACTER_ANGLES,
  LIGHT_BRIGHTNESS,
  LIGHT_COLORS,
  LIGHT_POSITIONS,
  SHOT_SIZES,
  buildShotPrompt,
} from '../data/shotOptions'
import { useCanvasStore } from './canvasStore'
import { collectUpstreamInputs } from './graphInputs'
import { absolutePosition } from './graphOps'
import { findMaterialIssue, suggestModel, type MaterialCounts } from './materialCheck'

/** 图片 3 秒、视频 5 秒查一次，跟落地页 job tracker 一个节奏 */
const POLL_MS = { image: 3000, video: 5000 }

/**
 * 一次点击最多提交多少个任务。
 * 生成数量 N × 多角度 M 个会相乘（4 条 × 4 个角度 = 16 个任务），
 * 每个都是真金白银的上游调用，必须有个闸。
 */
const MAX_TASKS_PER_RUN = 20

type ImageShotConfig = {
  angleKeys: string[]
  lightPositionKeys: string[]
  lightColorKey: string | null
  lightBrightnessKey: string | null
  shotSizeKey: string | null
  cameraHeightKey: string | null
}

/**
 * 把节点上的各种勾选拼成最终提示词。
 * 顺序固定：用户自己写的 → 素材库 → 镜头/打光 → 角度。角度放最后，多角度生成时只有这一段不同。
 */
export function composeNodePrompt(options: {
  basePrompt: string
  snippets: PromptSnippet[]
  snippetIds: string[]
  shot?: ImageShotConfig
  angleKey?: string | null
}) {
  const { positive, negative } = composeSnippetPrompt(options.snippets, options.snippetIds)
  const parts = [options.basePrompt.trim(), positive]

  if (options.shot) {
    parts.push(
      buildShotPrompt([
        { list: LIGHT_POSITIONS, keys: options.shot.lightPositionKeys },
        {
          list: LIGHT_BRIGHTNESS,
          keys: options.shot.lightBrightnessKey ? [options.shot.lightBrightnessKey] : [],
        },
        {
          list: LIGHT_COLORS,
          keys: options.shot.lightColorKey ? [options.shot.lightColorKey] : [],
        },
        {
          list: SHOT_SIZES,
          keys: options.shot.shotSizeKey ? [options.shot.shotSizeKey] : [],
        },
        {
          list: CAMERA_HEIGHTS,
          keys: options.shot.cameraHeightKey ? [options.shot.cameraHeightKey] : [],
        },
      ]),
    )
  }

  if (options.angleKey) {
    parts.push(buildShotPrompt([{ list: CHARACTER_ANGLES, keys: [options.angleKey] }]))
  }

  return { prompt: parts.filter(Boolean).join(', '), negativePrompt: negative }
}

export type RunOptions = {
  nodeId: string
  mode: 'image' | 'video'
  /** 参数要按厂商拼，光有 id 不够，得拿到整个模型对象 */
  model: ModelWithCapabilities | null
  /** 同类的全部模型：当前模型收不了连进来的素材时，从这里挑一个建议给用户（不会自动换） */
  models?: ModelWithCapabilities[]
  prompt: string
  negativePrompt?: string
  /** 用户在节点上选的画幅；是比例还是像素尺寸由厂商决定 */
  ratioOverride?: string
  sizeOverride?: string
  durationSeconds?: number
  /** 一次生成几条：同一份输入跑几遍，每遍一个独立任务 */
  outputCount?: number
  /** 多角度：每个角度一个任务，产出各自的图片节点 */
  angleKeys?: string[]
  snippets: PromptSnippet[]
  snippetIds: string[]
  shot?: ImageShotConfig
}

/**
 * 一次运行的结局。级联执行靠它决定要不要接着跑下一批：
 * - blocked：没提交（没选模型、没写提示词、素材不兼容），一分钱没花
 * - failed：提交了但一条都没出来
 * - completed：至少出来一条
 * - cancelled：用户取消级联，或者节点在跑的时候被删了
 */
export type RunOutcome = 'blocked' | 'failed' | 'completed' | 'cancelled'

type Watcher = { nodeId: string; mode: 'image' | 'video'; timer: number; finish: (task: ApiTask | null) => void }

/**
 * 提交生成 + 轮询 + 把结果落成素材节点并连线。
 *
 * 整张画布只有一份（由 NodeRunProvider 在画布最外层建），不在每个节点里各建一份：
 * 节点被折叠进组里时会卸载，轮询要是挂在节点上就跟着断了。画布关掉时统一停。
 */
export function useNodeRun() {
  const t = useTranslations('canvas')
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  const addNode = useCanvasStore((state) => state.addNode)
  const onConnect = useCanvasStore((state) => state.onConnect)
  /** taskId → 正在轮询的任务 */
  const watchers = useRef(new Map<string, Watcher>())
  /** 被「取消级联」叫停的节点，run 收尾时据此返回 cancelled */
  const cancelledNodes = useRef(new Set<string>())

  useEffect(() => {
    const map = watchers.current
    return () => {
      map.forEach((watcher) => watcher.finish(null))
      map.clear()
    }
  }, [])

  /** 结果落成素材节点，挂在生成器右边，一条一行往下排 */
  const landResult = useCallback(
    (nodeId: string, mode: 'image' | 'video', task: ApiTask) => {
      const { nodes } = useCanvasStore.getState()
      const byId = new Map(nodes.map((node) => [node.id, node]))
      const source = byId.get(nodeId)
      // 生成器可能在组里，坐标是相对组的；结果放在画布坐标下，不塞进组
      const origin = source ? absolutePosition(source as CanvasNode, byId) : { x: 0, y: 0 }
      const existing = nodes.filter((node) => node.data?.sourceNodeId === nodeId).length
      const resultId = addNode(
        mode === 'image' ? 'image' : 'video',
        { x: origin.x + 380, y: origin.y + existing * 220 },
        { url: task.resultUrl, thumbnailUrl: task.thumbnailUrl, taskId: task.id, sourceNodeId: nodeId },
      )
      onConnect({ source: nodeId, target: resultId, sourceHandle: null, targetHandle: null })
    },
    [addNode, onConnect],
  )

  /** 盯一个任务直到结束；主任务顺便把进度写到节点上。节点被删或被取消时以 null 结束 */
  const watchTask = useCallback(
    (nodeId: string, mode: 'image' | 'video', taskId: string, primary: boolean) =>
      new Promise<ApiTask | null>((resolve) => {
        const finish = (task: ApiTask | null) => {
          const watcher = watchers.current.get(taskId)
          if (watcher) window.clearInterval(watcher.timer)
          watchers.current.delete(taskId)
          resolve(task)
        }
        const tick = async () => {
          // 节点被删掉就别再查了
          if (!useCanvasStore.getState().nodes.some((node) => node.id === nodeId)) {
            finish(null)
            return
          }
          try {
            const task = mode === 'image' ? await imageService.getTask(taskId) : await videoService.getTask(taskId)
            if (!watchers.current.has(taskId)) return
            if (task.status === 'completed' || task.status === 'failed') {
              // 每条一出来就落节点，不等同一批的其它条
              if (task.status === 'completed' && task.resultUrl) landResult(nodeId, mode, task)
              finish(task)
              return
            }
            if (primary) updateNodeData(nodeId, { status: task.status, progress: task.progress ?? null })
          } catch {
            // 单次查询失败不终止轮询，下一轮再试
          }
        }
        const timer = window.setInterval(() => void tick(), POLL_MS[mode])
        watchers.current.set(taskId, { nodeId, mode, timer, finish })
        void tick()
      }),
    [landResult, updateNodeData],
  )

  /**
   * 取消级联：不再等这些任务，视频任务顺手向后台发取消（图片接口没有取消，只能让它在后台跑完，
   * 结果去任务队列里找）。只停这份 runner 里正在跑的，不影响别的。
   */
  const cancelAll = useCallback(() => {
    const stopped = new Set<string>()
    watchers.current.forEach((watcher, taskId) => {
      if (watcher.mode === 'video') void videoService.cancelTask(taskId).catch(() => undefined)
      cancelledNodes.current.add(watcher.nodeId)
      stopped.add(watcher.nodeId)
      watcher.finish(null)
    })
    return stopped.size
  }, [])

  /** 当前模型收不收连进来的素材；不收就报错，并建议一个收的（用户点了才换） */
  const blockOnMaterials = useCallback(
    (options: RunOptions, model: ModelWithCapabilities, counts: MaterialCounts) => {
      const issue = findMaterialIssue(model, counts)
      if (!issue) return false
      const kind = t(`materialKind.${issue.kind}`)
      const message =
        issue.reason === 'unsupported'
          ? t('errors.materialUnsupported', { model: model.name, kind })
          : t('errors.materialOverLimit', { model: model.name, kind, max: issue.max, count: issue.count })
      const alternative = suggestModel(options.models ?? [], counts, model.id)
      toast.error(message, {
        duration: 10000,
        description: alternative ? undefined : t('errors.materialNoAlternative', { kind }),
        action: alternative
          ? {
              label: t('errors.materialSwitch', { model: alternative.name }),
              onClick: () => {
                updateNodeData(options.nodeId, { modelId: alternative.id })
                toast.success(t('flow.switchedModel', { model: alternative.name, kind }))
              },
            }
          : undefined,
      })
      return true
    },
    [t, updateNodeData],
  )

  const run = useCallback(
    async (options: RunOptions): Promise<RunOutcome> => {
      const { nodeId, mode, model } = options
      const modelId = model?.id ?? null
      if (!modelId || !model) {
        toast.error(t('errors.modelRequired'))
        return 'blocked'
      }
      if (!options.prompt.trim()) {
        toast.error(t('errors.promptRequired'))
        return 'blocked'
      }

      // 连线真正起作用：把直接上游的文字 / 素材 / 提示词组收进来
      const { nodes, edges } = useCanvasStore.getState()
      const upstream = collectUpstreamInputs(nodeId, nodes, edges)

      // 模型收不了连进来的素材：素材不动，这里拦下（用户定的规矩，见 materialCheck）
      const counts = {
        images: upstream.imageUrls.length,
        videos: upstream.videoUrls.length,
        audios: upstream.audioUrls.length,
      }
      if (blockOnMaterials(options, model, counts)) return 'blocked'
      // 模型收视频 / 音频，但画布这一版只会把图片发出去——明说，别让人以为连上就生效了
      if (counts.videos + counts.audios > 0) toast.warning(t('errors.mediaNotSent'))

      // 上游的图片下载成 File，交给按厂商的参数构造（它负责转 base64 或先上传）
      let referenceFiles: File[] = []
      if (upstream.imageUrls.length > 0) {
        const settled = await Promise.allSettled(
          upstream.imageUrls.map((url, index) => urlToFile(url, `canvas-ref-${index}`)),
        )
        referenceFiles = settled
          .filter((item): item is PromiseFulfilledResult<File> => item.status === 'fulfilled')
          .map((item) => item.value)
        const failed = settled.length - referenceFiles.length
        // 远程图没有 CORS 头时下载不回来，不能静默丢掉——用户看着连了线却没起作用会以为是 bug
        if (failed > 0) toast.warning(t('errors.referencesDropped', { count: failed }))
      }

      // 多角度：一个角度一个任务。没勾角度就当成单张。
      const angles = options.angleKeys?.length ? options.angleKeys : [null]
      // 生成数量：同一份输入跑几遍，每遍是一个独立任务（上游各自随机，结果不同）
      const outputCount = Math.max(1, Math.round(options.outputCount ?? 1))

      const plannedCount = angles.length * outputCount
      if (plannedCount > MAX_TASKS_PER_RUN) {
        toast.error(
          t('errors.tooManyTasks', {
            planned: plannedCount,
            count: outputCount,
            angles: angles.length,
            max: MAX_TASKS_PER_RUN,
          }),
        )
        updateNodeData(nodeId, { status: 'idle' })
        return 'blocked'
      }

      cancelledNodes.current.delete(nodeId)
      updateNodeData(nodeId, {
        status: 'submitting',
        errorMessage: null,
        progress: null,
        startedAt: new Date().toISOString(),
      })

      const tasks: ApiTask[] = []
      // 同一份输入，跑 outputCount 遍；每遍再乘上角度
      for (let round = 0; round < outputCount; round += 1) {
        const roundFiles = referenceFiles
        for (const angleKey of angles) {
          const { prompt, negativePrompt } = composeNodePrompt({
            // 上游文字放在自己写的提示词前面：它通常是角色 / 场景描述，是更根本的设定
            basePrompt: [...upstream.texts, options.prompt].filter(Boolean).join('\n'),
            snippets: options.snippets,
            snippetIds: [...new Set([...options.snippetIds, ...upstream.snippetIds])],
            shot: options.shot,
            angleKey,
          })
          try {
            // 各家的参数名完全不同（GPT Image 用 size、豆包连比例参数都没有、MJ 要 botType…），
            // 复用落地页那套已经验证过的按厂商构造，不要在这里另写一份
            const parameters = await buildLandingParameters({
              mode,
              model,
              duration: options.durationSeconds ?? 5,
              referenceImages: roundFiles,
              uploadVideoReference: (files, provider) =>
                videoService
                  .uploadSeedanceInputs('image', files, provider)
                  .then((result) => result.files.map((file) => file.url)),
              ratioOverride: options.ratioOverride,
              sizeOverride: options.sizeOverride,
            })
            const request = {
              modelId,
              prompt,
              ...(negativePrompt ? { negativePrompt } : {}),
              ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
            }
            const task = mode === 'image' ? await imageService.generate(request) : await videoService.generate(request)
            tasks.push(task)
          } catch (error) {
            const failure = classifyFailureMessage(error instanceof Error ? error.message : null)
            updateNodeData(nodeId, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : (failure?.kind ?? t('errors.submitFailed')),
            })
            // 前面已经提交出去的几条照样盯着，出了结果还是落到画布上
            await Promise.all(tasks.map((task) => watchTask(nodeId, mode, task.id, false)))
            return 'failed'
          }
        }
      }

      // 节点上只显示第一个任务的进度，其余的结果回来各自落节点
      const [first] = tasks
      if (!first) return 'failed'
      updateNodeData(nodeId, { status: first.status, taskId: first.id, startedAt: first.createdAt })

      const results = await Promise.all(tasks.map((task, index) => watchTask(nodeId, mode, task.id, index === 0)))

      if (cancelledNodes.current.has(nodeId)) {
        cancelledNodes.current.delete(nodeId)
        updateNodeData(nodeId, { status: 'idle', progress: null })
        return 'cancelled'
      }
      if (results.every((task) => task === null)) return 'cancelled'

      const succeeded = results.filter((task) => task?.status === 'completed' && task.resultUrl).length
      if (succeeded > 0) {
        updateNodeData(nodeId, { status: 'completed', progress: 100, errorMessage: null })
        const failedCount = results.length - succeeded
        if (failedCount > 0) toast.warning(t('errors.partialFailed', { failed: failedCount, total: results.length }))
        return 'completed'
      }

      // 上游说完成了却没文件，也按失败处理，否则节点会一直挂着
      const firstError = results.find((task) => task?.errorMessage)?.errorMessage ?? null
      const failure = classifyFailureMessage(firstError)
      updateNodeData(nodeId, {
        status: 'failed',
        errorMessage: firstError ?? failure?.kind ?? t('node.generator.failed'),
      })
      return 'failed'
    },
    [blockOnMaterials, updateNodeData, watchTask, t],
  )

  return { run, cancelAll }
}
