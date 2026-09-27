'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy, ExternalLink, Film, Image as ImageIcon, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from '@/i18n/client'
import type { ApiTask } from '@/lib/api/types/task'
import { classifyFailureMessage } from '@/lib/utils/failure'
import { TaskCard } from './TaskCard'
import {
  formatDateTime,
  formatDuration,
  getTaskDurationMs,
  getTaskPreviewUrl,
  isTaskActive,
} from './taskQueueUtils'
import { TaskProgress } from '@/components/shared/TaskProgress'
import { useNow } from '@/lib/hooks/useNow'
import { toSameOriginAsset } from '@/lib/utils/assetUrl'

interface TaskDetailDrawerProps {
  task: ApiTask
  projectName: string | null
  onClose: () => void
  onRemix: () => void
  onUpdate: (nextTask?: ApiTask) => void
  onDelete: () => void
}

/**
 * 任务详情抽屉：预览、复制提示词 / 任务编号、失败原因、做同款。
 * 厂商专属操作（MJ U/V、GPT 编辑、NanoBanana 重绘、取消、重试、下载、删除）直接复用 TaskCard 的操作区，
 * 不在这里重写一遍。portal 到 body；任务页挂载时 body 带 dark + studio-skin，所以配色跟页面一致。
 */
export function TaskDetailDrawer({ task, projectName, onClose, onRemix, onUpdate, onDelete }: TaskDetailDrawerProps) {
  const t = useTranslations('tasks')
  const tFailure = useTranslations('errors.failure')
  const locale = useLocale()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('drawer.copied'))
    } catch {
      toast.error(t('drawer.copyFailed'))
    }
  }

  const active = isTaskActive(task)
  const now = useNow(active)
  const durationMs = getTaskDurationMs(task, now)
  const previewUrl = task.status === 'completed' ? getTaskPreviewUrl(task) : null
  const failure = task.status === 'failed' ? classifyFailureMessage(task.errorMessage) : null

  const infoItems: Array<[string, string]> = [
    [t('drawer.type'), task.type === 'video' ? t('queue.type.video') : t('queue.type.image')],
    [t('drawer.model'), task.modelName || task.provider || '—'],
    [t('drawer.status'), t(`status.${task.status}`)],
    [t('drawer.project'), projectName ?? t('queue.project.none')],
    [t('drawer.createdAt'), formatDateTime(task.createdAt, locale)],
    [t('drawer.completedAt'), formatDateTime(task.completedAt, locale)],
    [t('drawer.duration'), durationMs === null ? '—' : formatDuration(durationMs)],
  ]

  return createPortal(
    <div className="task-drawer-root" role="dialog" aria-modal="true" aria-label={t('drawer.title')}>
      <button type="button" className="task-drawer-backdrop" onClick={onClose} aria-label={t('drawer.close')} />
      <aside className="task-drawer">
        <header className="task-drawer-header">
          <div className="min-w-0">
            <span className="studio-kicker">{t('drawer.title')}</span>
            <p className="task-drawer-taskno">{task.taskNo}</p>
          </div>
          <button type="button" className="task-drawer-close" onClick={onClose} aria-label={t('drawer.close')}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="task-drawer-body">
          <div className="task-drawer-preview" style={{ aspectRatio: '16 / 9' }}>
            {previewUrl && task.type === 'video' ? (
              <video
                src={toSameOriginAsset(task.resultUrl) || undefined}
                poster={toSameOriginAsset(task.thumbnailUrl) || undefined}
                controls
                playsInline
                preload="metadata"
              />
            ) : previewUrl ? (
              <img src={toSameOriginAsset(task.resultUrl || previewUrl)} alt={task.prompt} />
            ) : (
              <span className="task-row-thumb-placeholder">
                {task.type === 'video' ? <Film className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                <small>
                  {active
                    ? task.status === 'pending'
                      ? t('queue.queued')
                      : t('queue.generating')
                    : task.status === 'completed'
                      ? t('queue.noResult')
                      : t('status.failed')}
                </small>
              </span>
            )}
          </div>
          <TaskProgress
            status={task.status}
            type={task.type}
            createdAt={task.createdAt}
            progress={task.progress}
            modelId={task.modelId}
          />
          {task.status === 'completed' && task.resultUrl && (
            <a className="studio-gold-link inline-flex items-center gap-1" href={toSameOriginAsset(task.resultUrl)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              {t('drawer.openOriginal')}
            </a>
          )}

          {failure && (
            <section className="task-drawer-failure">
              <strong>{t('failure.reason')}</strong>
              <p>{tFailure(failure.kind)}</p>
              {failure.detail && <p className="task-drawer-failure-detail">{failure.detail}</p>}
            </section>
          )}

          <section className="task-drawer-section">
            <div className="task-drawer-section-head">
              <strong>{t('drawer.prompt')}</strong>
              <button type="button" className="studio-gold-link inline-flex items-center gap-1" onClick={() => void copyText(task.prompt)}>
                <Copy className="h-3 w-3" />
                {t('drawer.copyPrompt')}
              </button>
            </div>
            <p className="task-drawer-prompt">{task.prompt || '—'}</p>
            {task.negativePrompt && (
              <>
                <div className="task-drawer-section-head mt-3">
                  <strong>{t('drawer.negativePrompt')}</strong>
                </div>
                <p className="task-drawer-prompt">{task.negativePrompt}</p>
              </>
            )}
          </section>

          <section className="task-drawer-section">
            <div className="task-drawer-section-head">
              <strong>{t('drawer.taskNo')}</strong>
              <button type="button" className="studio-gold-link inline-flex items-center gap-1" onClick={() => void copyText(task.taskNo)}>
                <Copy className="h-3 w-3" />
                {t('drawer.copyTaskNo')}
              </button>
            </div>
            <dl className="task-drawer-info">
              {infoItems.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <button type="button" className="studio-gold-button" onClick={onRemix}>
            <Wand2 className="h-4 w-4" />
            {t('queue.actions.remix')}
          </button>

          <section className="task-drawer-section">
            <div className="task-drawer-section-head">
              <strong>{t('drawer.moreActions')}</strong>
            </div>
            <div className="task-drawer-actions">
              <TaskCard task={task} onUpdate={onUpdate} onDelete={onDelete} hideSummary />
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
