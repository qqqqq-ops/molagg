import type { ApiTask } from '@/lib/api/types/task'

export { formatDuration } from '@/lib/utils/taskProgress'

export function taskKey(task: Pick<ApiTask, 'type' | 'id'>) {
  return `${task.type}-${task.id}`
}

export function isTaskActive(task: Pick<ApiTask, 'status'>) {
  return task.status === 'pending' || task.status === 'processing'
}

/** 进行中 = 从创建到现在；已结束 = 从创建到完成。没有完成时间的已结束任务不显示耗时 */
export function getTaskDurationMs(task: ApiTask, now: number) {
  const start = new Date(task.createdAt).getTime()
  if (!Number.isFinite(start)) return null
  if (isTaskActive(task)) return now - start
  if (!task.completedAt) return null
  const end = new Date(task.completedAt).getTime()
  return Number.isFinite(end) ? end - start : null
}

export function formatDateTime(value: string | null, locale: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getTaskPreviewUrl(task: ApiTask) {
  return task.thumbnailUrl || task.resultUrl || null
}
