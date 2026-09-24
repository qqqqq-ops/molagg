'use client'

import { Download, Film, Image as ImageIcon, Wand2 } from 'lucide-react'
import { useLocale, useTranslations } from '@/i18n/client'
import type { ApiTask } from '@/lib/api/types/task'
import { classifyFailureMessage } from '@/lib/utils/failure'
import { downloadTaskResult } from '@/lib/utils/downloadTask'
import {
  formatDateTime,
  formatDuration,
  getTaskDurationMs,
  getTaskPreviewUrl,
  isTaskActive,
} from './taskQueueUtils'
import { TaskProgress } from '@/components/shared/TaskProgress'

interface TaskQueueRowProps {
  task: ApiTask
  projectName: string | null
  onOpen: () => void
  onRemix: () => void
}

/** 任务队列的一行：148px 缩略图 | 提示词 + 状态 + 进度 + 信息 | 操作（照 creative-studio/tasks） */
export function TaskQueueRow({ task, projectName, onOpen, onRemix }: TaskQueueRowProps) {
  const t = useTranslations('tasks')
  const tFailure = useTranslations('errors.failure')
  const locale = useLocale()

  const active = isTaskActive(task)
  // 进行中的已用时间在进度条那行里；这里只给已结束任务显示总耗时
  const durationMs = active ? null : getTaskDurationMs(task, Date.now())
  const previewUrl = task.status === 'completed' ? getTaskPreviewUrl(task) : null
  const completedWithoutFile = task.status === 'completed' && !task.resultUrl
  const failure = task.status === 'failed' ? classifyFailureMessage(task.errorMessage) : null

  return (
    <article className="task-row" data-status={task.status}>
      <button type="button" className="task-row-thumb" onClick={onOpen} aria-label={t('queue.actions.detail')}>
        {previewUrl && task.type === 'video' && !task.thumbnailUrl ? (
          <video src={previewUrl} muted playsInline preload="metadata" />
        ) : previewUrl ? (
          <img src={previewUrl} alt="" loading="lazy" />
        ) : (
          <span className="task-row-thumb-placeholder">
            {task.type === 'video' ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            <small>
              {active
                ? task.status === 'pending'
                  ? t('queue.queued')
                  : t('queue.generating')
                : task.status === 'failed'
                  ? t('status.failed')
                  : t('queue.noPreview')}
            </small>
          </span>
        )}
        <span className="task-row-type">{task.type === 'video' ? t('queue.type.video') : t('queue.type.image')}</span>
      </button>

      <div className="task-row-body">
        <button type="button" className="task-row-prompt" onClick={onOpen} title={task.prompt}>
          {task.prompt || '—'}
        </button>

        <div className="task-row-meta">
          <span className="task-status-badge" data-status={task.status}>
            {t(`status.${task.status}`)}
          </span>
          {(task.modelName || task.provider) && <span>{task.modelName || task.provider}</span>}
          {projectName && <span>{projectName}</span>}
        </div>

        <TaskProgress
          status={task.status}
          type={task.type}
          createdAt={task.createdAt}
          progress={task.progress}
          modelId={task.modelId}
        />

        {failure && (
          <p className="task-row-failure" title={task.errorMessage ?? undefined}>
            {tFailure(failure.kind)}
          </p>
        )}
        {completedWithoutFile && <p className="task-row-failure">{t('queue.noResult')}</p>}

        <div className="task-row-info">
          <span>{task.taskNo}</span>
          <span>{formatDateTime(task.createdAt, locale)}</span>
          {durationMs !== null && <span>{t('queue.duration', { time: formatDuration(durationMs) })}</span>}
        </div>
      </div>

      <div className="task-row-actions">
        <button type="button" className="studio-outline-button" onClick={onOpen}>
          {t('queue.actions.detail')}
        </button>
        <button type="button" className="studio-outline-button" onClick={onRemix}>
          <Wand2 className="h-3.5 w-3.5" />
          {t('queue.actions.remix')}
        </button>
        {task.status === 'completed' && task.resultUrl && (
          <button
            type="button"
            className="studio-outline-button"
            onClick={() => void downloadTaskResult(task)}
            aria-label={t('queue.actions.download')}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="task-row-action-label">{t('queue.actions.download')}</span>
          </button>
        )}
      </div>
    </article>
  )
}
