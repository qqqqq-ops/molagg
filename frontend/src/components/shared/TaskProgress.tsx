'use client'

import { useTranslations } from '@/i18n/client'
import { useNow } from '@/lib/hooks/useNow'
import { useTaskEstimates } from '@/lib/hooks/useTaskEstimates'
import { cn } from '@/lib/utils/cn'
import { formatDuration, resolveTaskProgress, type TaskProgressInput } from '@/lib/utils/taskProgress'

interface TaskProgressProps extends TaskProgressInput {
  /** 显示百分比 / 预计剩余这行文字 */
  showLabel?: boolean
  className?: string
}

/**
 * 进行中任务的进度条 + 说明文字。真实进度显示「45%」；估算显示「约 45% · 预计还需 1m 10s」。
 * 颜色走 --studio-*（工作台页面），不在工作台里时有兜底色（落地页）。
 */
export function TaskProgress({ showLabel = true, className, ...input }: TaskProgressProps) {
  const t = useTranslations('tasks.progress')
  const active = input.status === 'submitting' || input.status === 'pending' || input.status === 'processing'
  const now = useNow(active)
  const estimates = useTaskEstimates(active)

  if (!active) return null

  const resolved = resolveTaskProgress(input, now, estimates)
  const stage = input.status === 'submitting' ? t('submitting') : input.status === 'pending' ? t('queued') : t('generating')

  let label = stage
  if (resolved.kind !== 'indeterminate') {
    const percent = Math.floor(resolved.percent)
    const parts = [stage, resolved.kind === 'real' ? t('real', { value: percent }) : t('estimated', { value: percent })]
    if (resolved.kind === 'estimated') {
      parts.push(
        resolved.overdue
          ? t('overdue')
          : resolved.remainingMs !== null
            ? t('remaining', { time: formatDuration(resolved.remainingMs) })
            : '',
      )
    }
    parts.push(t('elapsed', { time: formatDuration(resolved.elapsedMs) }))
    label = parts.filter(Boolean).join(' · ')
  }

  return (
    <div className={cn('task-progress-block', className)}>
      <div
        className="task-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={resolved.kind === 'indeterminate' ? undefined : Math.floor(resolved.percent)}
        aria-label={label}
      >
        {resolved.kind === 'indeterminate' ? (
          <span className="task-progress-indeterminate" />
        ) : (
          <span
            className="task-progress-value"
            data-kind={resolved.kind}
            style={{ width: `${resolved.percent}%` }}
          />
        )}
      </div>
      {showLabel && <p className="task-progress-label">{label}</p>}
    </div>
  )
}
