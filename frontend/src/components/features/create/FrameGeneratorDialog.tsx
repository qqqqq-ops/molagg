'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { TaskProgress } from '@/components/shared/TaskProgress'
import { Modal } from '@/components/ui/Modal'
import { imageService } from '@/lib/api/services'
import type { ApiTask } from '@/lib/api/types'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { RelayPriceNote } from '@/components/shared/RelayPriceNote'
import { useMediaModels } from '@/lib/hooks/useMediaModels'
import { useRelayPricing } from '@/lib/hooks/useRelayPricing'
import { urlToFile } from '@/lib/utils/urlToFile'
import { cn } from '@/lib/utils/cn'

import { buildLandingParameters } from '../home/landingGenerate'
import { getAspectRatioOptions, getImageSizeOptions } from './config/aspectRatioOptions'

/**
 * 「生成这一帧」——首尾帧模式里用图片模型现场生成一张关键帧。
 *
 * 创作页整体已经是纯视频，图片能力就活在这里：出来的图直接塞进首帧 / 尾帧槽位，
 * 所以结果要转成 File（槽位用的是 FileDropzone，吃的是 File[]）。
 *
 * 调用方在关闭时**不渲染**这个组件，所以这里不需要「开关时重置状态」的 effect，
 * 每次打开都是全新实例。
 */

const POLL_MS = 3000
/** 图片任务超过这个时间还没结果就停轮询，避免弹窗关了还在后台转 */
const POLL_TIMEOUT_MS = 5 * 60 * 1000

type RunStatus = 'idle' | 'submitting' | 'pending' | 'processing'

interface FrameGeneratorDialogProps {
  onClose: () => void
  /** 「起始帧」或「结束帧」，只用于标题 */
  slotLabel: string
  /** 生成好的图，调用方塞进对应槽位 */
  onGenerated: (file: File) => void
  /** 带进来的初始提示词，通常是视频那边写好的那段 */
  initialPrompt?: string
}

/**
 * 轮询到出结果为止。放在模块级（不在组件体里）有两个好处：
 * 明确不是渲染期代码（react-hooks/purity 不会再报 Date.now()），逻辑也好单测。
 * 返回 stop()，调用方在卸载时调用。
 */
function pollImageTask(
  taskId: string,
  handlers: {
    onProgress: (task: ApiTask) => void
    onDone: (task: ApiTask) => void
    onFail: (message: string) => void
  },
) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let timer: number | null = null
  const stop = () => {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  const tick = async () => {
    if (Date.now() > deadline) {
      stop()
      handlers.onFail('生成超时，请重试')
      return
    }
    try {
      const task = await imageService.getTask(taskId)
      if (task.status === 'completed' && task.resultUrl) {
        stop()
        handlers.onDone(task)
        return
      }
      if (task.status === 'completed' || task.status === 'failed') {
        // 说完成了却没文件，也按失败处理，否则弹窗会一直转
        stop()
        handlers.onFail(task.errorMessage ?? '生成失败')
        return
      }
      handlers.onProgress(task)
    } catch {
      // 单次查询失败不终止，下一轮再试
    }
  }

  timer = window.setInterval(() => void tick(), POLL_MS)
  void tick()
  return stop
}

export function FrameGeneratorDialog({
  onClose,
  slotLabel,
  onGenerated,
  initialPrompt = '',
}: FrameGeneratorDialogProps) {
  const { models, loading } = useMediaModels('image')
  const [prompt, setPrompt] = useState(initialPrompt)
  /** 空字符串 = 还没选过，用列表第一个 */
  const [pickedModelId, setPickedModelId] = useState('')
  const [pickedAspect, setPickedAspect] = useState('')
  const [status, setStatus] = useState<RunStatus>('idle')
  const [progress, setProgress] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  // 卸载就停轮询（弹窗一关组件就没了），否则任务还在后台查、结果也没人接
  useEffect(() => () => stopRef.current?.(), [])

  // 默认选第一个、换模型时画幅失效——都用派生值，不在 effect 里同步 state
  const modelId = pickedModelId || models[0]?.id || ''
  const model = models.find((item) => item.id === modelId) ?? null
  const priceFor = useRelayPricing()
  const sizeOptions = model ? getImageSizeOptions(model.provider) : null
  const usesSize = Boolean(sizeOptions?.length)
  const aspectOptions = usesSize ? sizeOptions! : model ? getAspectRatioOptions(model.provider) : []
  // 换了模型后原来选的画幅可能不在新列表里，这时当作没选
  const aspect = aspectOptions.some((option) => option.value === pickedAspect) ? pickedAspect : ''
  const running = status !== 'idle'

  const handleGenerate = async () => {
    if (!model) {
      toast.error('请先选择图片模型')
      return
    }
    if (!prompt.trim()) {
      toast.error('请先填写提示词')
      return
    }

    setStatus('submitting')
    setError(null)
    setProgress(null)

    try {
      // 参数按厂商拼，跟落地页 / 画布同一份，不在这里另写
      const parameters = await buildLandingParameters({
        mode: 'image',
        model: model as ModelWithCapabilities,
        duration: 5,
        referenceImages: [],
        uploadVideoReference: async () => [],
        ...(usesSize ? { sizeOverride: aspect || undefined } : { ratioOverride: aspect || undefined }),
      })

      const task = await imageService.generate({
        modelId: model.id,
        prompt: prompt.trim(),
        ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
      })

      setStatus(task.status === 'pending' ? 'pending' : 'processing')
      setStartedAt(task.createdAt)

      stopRef.current = pollImageTask(task.id, {
        onProgress: (latest) => {
          setStatus(latest.status === 'pending' ? 'pending' : 'processing')
          setProgress(latest.progress ?? null)
        },
        onDone: (latest) => {
          void urlToFile(latest.resultUrl!, `frame-${Date.now()}`)
            .then((file) => {
              onGenerated(file)
              toast.success(`已生成${slotLabel}`)
              onClose()
            })
            .catch((err: unknown) => {
              setStatus('idle')
              setError(err instanceof Error ? err.message : '下载生成结果失败')
            })
        },
        onFail: (message) => {
          setStatus('idle')
          setError(message)
        },
      })
    } catch (err) {
      setStatus('idle')
      setError(err instanceof Error ? err.message : '提交失败')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`生成${slotLabel}`} size="sm">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          用图片模型现场生成一张关键帧，生成后直接放进{slotLabel}槽位。
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">提示词</label>
          <textarea
            className="w-full rounded-md border border-stone-200 bg-transparent p-2 text-sm dark:border-stone-700"
            rows={3}
            value={prompt}
            disabled={running}
            placeholder="描述这一帧的画面"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">图片模型</label>
          <select
            className="w-full rounded-md border border-stone-200 bg-transparent p-2 text-sm dark:border-stone-700"
            value={modelId}
            disabled={running}
            onChange={(event) => setPickedModelId(event.target.value)}
          >
            {models.length === 0 && <option value="">{loading ? '加载中…' : '暂无可用图片渠道'}</option>}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        {aspectOptions.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{usesSize ? '尺寸' : '画幅'}</label>
            <div className="flex flex-wrap gap-1.5">
              {aspectOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={running}
                  className={cn(
                    'rounded border px-2 py-1 text-xs transition-colors',
                    aspect === option.value
                      ? 'border-aurora-purple text-aurora-purple'
                      : 'border-stone-200 text-muted-foreground hover:border-stone-400 dark:border-stone-700',
                  )}
                  onClick={() => setPickedAspect(aspect === option.value ? '' : option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded border-l-2 border-red-400 bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:bg-red-950/30">
            {error}
          </p>
        )}

        {running && (
          <TaskProgress
            status={status === 'submitting' ? 'submitting' : status}
            type="image"
            createdAt={startedAt}
            progress={progress}
            modelId={modelId || null}
          />
        )}

        <RelayPriceNote price={priceFor(model)} />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-stone-200 px-3 py-1.5 text-sm dark:border-stone-700"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={running || !model}
            className="inline-flex items-center gap-1.5 rounded bg-aurora-purple px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => void handleGenerate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {running ? '生成中…' : '生成'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
