/**
 * 任务进度的统一口径（任务队列、创作页右栏、落地页共用）：
 * - 上游给了真实进度（task.progress）→ 直接用，kind = 'real'
 * - 没给 → 按「这个模型最近成功任务的耗时中位数」估算，kind = 'estimated'，界面必须标「约」
 *   没有历史时用按类型的保守默认值；到预计时长时停在 90%，之后慢慢逼近 99%，永远不会自己走到 100%
 */

export type TaskProgressInput = {
  status: 'submitting' | 'pending' | 'processing' | 'completed' | 'failed'
  type: 'image' | 'video'
  createdAt: string | null
  progress?: number | null
  modelId?: string | null
}

export type TaskDurationEstimateMap = Record<string, { medianMs: number; samples: number }>

export type ResolvedTaskProgress =
  | { kind: 'indeterminate' }
  | {
      kind: 'real' | 'estimated'
      percent: number
      elapsedMs: number
      /** 预计还需多久；真实进度或已超过预计时长时为 null */
      remainingMs: number | null
      /** 已超过预计时长（估算模式） */
      overdue: boolean
    }

/** 没有历史数据时的默认预计时长（偏保守：宁可提前完成，不要卡在 99% 很久） */
export const DEFAULT_DURATION_MS: Record<TaskProgressInput['type'], number> = {
  image: 90_000,
  video: 240_000,
}

function estimatePercent(elapsedMs: number, etaMs: number) {
  const ratio = elapsedMs / etaMs
  if (ratio <= 1) return Math.max(1, 90 * ratio)
  return 90 + 9 * (1 - Math.exp(-(ratio - 1) * 1.5))
}

export function resolveTaskProgress(
  input: TaskProgressInput,
  now: number,
  estimates: TaskDurationEstimateMap | null,
): ResolvedTaskProgress {
  if (input.status !== 'pending' && input.status !== 'processing') return { kind: 'indeterminate' }

  const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN
  if (!Number.isFinite(createdMs)) return { kind: 'indeterminate' }
  const elapsedMs = Math.max(0, now - createdMs)

  if (typeof input.progress === 'number' && Number.isFinite(input.progress)) {
    return {
      kind: 'real',
      percent: Math.min(100, Math.max(0, input.progress)),
      elapsedMs,
      remainingMs: null,
      overdue: false,
    }
  }

  const etaMs =
    (input.modelId && estimates?.[input.modelId]?.medianMs) || DEFAULT_DURATION_MS[input.type]
  const remaining = etaMs - elapsedMs
  return {
    kind: 'estimated',
    percent: estimatePercent(elapsedMs, etaMs),
    elapsedMs,
    remainingMs: remaining > 0 ? remaining : null,
    overdue: remaining <= 0,
  }
}

/** 12s / 3m 05s / 1h 02m */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}
