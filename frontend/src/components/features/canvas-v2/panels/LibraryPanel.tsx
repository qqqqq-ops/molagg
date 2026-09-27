'use client'

import { Film, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useLocale, useTranslations } from '@/i18n/client'
import { canvasService, projectsService, tasksService, type CanvasTemplateSummary } from '@/lib/api/services'
import type { ApiTask } from '@/lib/api/types'
import type { ImportableWork } from '@/lib/api/types/projects'
import { toSameOriginAsset } from '@/lib/utils/assetUrl'

import { useCanvasStore } from '../store/canvasStore'
import type { Graph } from '../store/graphPersist'

const ASSET_PAGE_SIZE = 24
const LOG_SIZE = 20

export type MediaDrop = { kind: 'image' | 'video'; url: string; thumbnailUrl: string | null; taskId: string }

type LibraryPanelProps = {
  /** 把一条作品放到画布上（视口中间） */
  onAddMedia: (media: MediaDrop) => void
  /** 把一个模板铺到画布上 */
  onApplyGraph: (graph: Graph) => number
  /** 当前选中的那一段，「保存为模板」用 */
  getSelection: () => Graph
}

function useShortTime() {
  const locale = useLocale()
  return useCallback(
    (value: string) =>
      new Date(value).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [locale],
  )
}

/** 素材：我的作品（生成过的图 / 视频）或资产库（上传的素材，跨全部项目），点一下放到画布上 */
function AssetSection({ onAddMedia }: Pick<LibraryPanelProps, 'onAddMedia'>) {
  const t = useTranslations('canvas')
  const [source, setSource] = useState<'works' | 'library'>('works')
  const [type, setType] = useState<'image' | 'video'>('image')
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [items, setItems] = useState<ImportableWork[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchPage = source === 'library' ? projectsService.getAssetLibrary : projectsService.getImportableWorks
    fetchPage({ page, limit: ASSET_PAGE_SIZE, type, ...(applied ? { q: applied } : {}) })
      .then((result) => {
        if (cancelled) return
        setItems((current) => (page === 1 ? result.data : [...current, ...result.data]))
        setHasMore(result.pagination.hasMore)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applied, page, source, type])

  const restart = (next: { source?: 'works' | 'library'; type?: 'image' | 'video'; q?: string }) => {
    setLoading(true)
    setPage(1)
    setItems([])
    if (next.source) {
      setSource(next.source)
      setQuery('')
      setApplied('')
    }
    if (next.type) setType(next.type)
    if (next.q !== undefined) setApplied(next.q)
  }

  return (
    <details className="cv2-details" open>
      <summary>{t('library.assets.title')}</summary>
      <div className="cv2-chips">
        {(['works', 'library'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={source === kind ? 'cv2-chip cv2-chip-active' : 'cv2-chip'}
            onClick={() => kind !== source && restart({ source: kind })}
          >
            {kind === 'works' ? t('library.assets.sourceWorks') : t('library.assets.sourceLibrary')}
          </button>
        ))}
      </div>
      <div className="cv2-chips">
        {(['image', 'video'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={type === kind ? 'cv2-chip cv2-chip-active' : 'cv2-chip'}
            onClick={() => kind !== type && restart({ type: kind })}
          >
            {kind === 'image' ? t('library.assets.images') : t('library.assets.videos')}
          </button>
        ))}
      </div>
      <input
        className="cv2-input"
        value={query}
        placeholder={source === 'library' ? t('library.assets.searchLibrary') : t('library.assets.search')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') restart({ q: query.trim() })
        }}
      />
      {failed ? (
        <p className="cv2-hint">{t('library.loadFailed')}</p>
      ) : items.length === 0 && !loading ? (
        <p className="cv2-hint">{source === 'library' ? t('library.assets.emptyLibrary') : t('library.assets.empty')}</p>
      ) : (
        <div className="cv2-asset-grid">
          {items.map((item) => {
            const url = item.resultUrl ?? item.thumbnailUrl
            if (!url) return null
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className="cv2-asset"
                title={item.prompt || t('library.assets.add')}
                onClick={() =>
                  onAddMedia({ kind: item.type, url, thumbnailUrl: item.thumbnailUrl, taskId: String(item.id) })
                }
              >
                {item.type === 'image' || item.thumbnailUrl ? (
                  <img src={toSameOriginAsset(item.thumbnailUrl ?? url)} alt="" loading="lazy" />
                ) : (
                  <Film className="h-5 w-5" />
                )}
                <span className="cv2-asset-add">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </button>
            )
          })}
        </div>
      )}
      {loading && <p className="cv2-hint">{t('library.loading')}</p>}
      {hasMore && !loading && (
        <button
          type="button"
          className="cv2-mini-button"
          onClick={() => {
            setLoading(true)
            setPage((current) => current + 1)
          }}
        >
          {t('library.loadMore')}
        </button>
      )}
    </details>
  )
}

/** 生成日志：最近的生成任务（全站的，带「本画布」标记），出完的点一下放到画布上 */
function LogSection({ onAddMedia }: Pick<LibraryPanelProps, 'onAddMedia'>) {
  const t = useTranslations('canvas')
  const shortTime = useShortTime()
  const nodes = useCanvasStore((state) => state.nodes)
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)

  // 画布里出现过的任务 id：生成器记着最近一次，结果节点记着自己那一条
  const canvasTaskIds = useMemo(
    () => new Set(nodes.map((node) => node.data?.taskId).filter((id): id is string => typeof id === 'string')),
    [nodes],
  )

  useEffect(() => {
    let cancelled = false
    tasksService
      .getFeed({ page: 1, limit: LOG_SIZE })
      .then((result) => {
        if (cancelled) return
        setTasks(result.data)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [round])

  const statusLabel = (status: string) => {
    if (status === 'completed') return t('library.log.completed')
    if (status === 'failed') return t('library.log.failed')
    if (status === 'processing') return t('library.log.processing')
    return t('library.log.pending')
  }

  return (
    <details className="cv2-details">
      <summary>{t('library.log.title')}</summary>
      <button
        type="button"
        className="cv2-mini-button"
        onClick={() => {
          setLoading(true)
          setRound((value) => value + 1)
        }}
      >
        <RefreshCw className="mr-1 inline h-3 w-3" />
        {t('library.refresh')}
      </button>
      {failed ? (
        <p className="cv2-hint">{t('library.loadFailed')}</p>
      ) : loading ? (
        <p className="cv2-hint">{t('library.loading')}</p>
      ) : tasks.length === 0 ? (
        <p className="cv2-hint">{t('library.log.empty')}</p>
      ) : (
        <ul className="cv2-log">
          {tasks.map((task) => {
            const usable = task.status === 'completed' && task.resultUrl
            return (
              <li key={`${task.type}-${task.id}`} className="cv2-log-row">
                <span className={`cv2-log-dot cv2-log-${task.status}`} title={statusLabel(task.status)} />
                <span className="cv2-log-main">
                  <span className="cv2-log-prompt" title={task.prompt}>
                    {task.prompt || t('library.log.noPrompt')}
                  </span>
                  <span className="cv2-log-meta">
                    {shortTime(task.createdAt)} · {task.modelName ?? task.provider} · {statusLabel(task.status)}
                    {canvasTaskIds.has(String(task.id)) && (
                      <span className="cv2-log-tag">{t('library.log.fromCanvas')}</span>
                    )}
                  </span>
                  {task.status === 'failed' && task.errorMessage && (
                    <span className="cv2-log-error">{task.errorMessage}</span>
                  )}
                </span>
                {usable && (
                  <button
                    type="button"
                    className="cv2-icon-button"
                    title={t('library.assets.add')}
                    onClick={() =>
                      onAddMedia({
                        kind: task.type,
                        url: task.resultUrl!,
                        thumbnailUrl: task.thumbnailUrl,
                        taskId: String(task.id),
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}

/** 工作流模板：自己存的模板一键铺开；选中一段节点「保存为模板」 */
function TemplateSection({ onApplyGraph, getSelection }: Omit<LibraryPanelProps, 'onAddMedia'>) {
  const t = useTranslations('canvas')
  const [templates, setTemplates] = useState<CanvasTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    canvasService
      .listTemplates()
      .then((list) => {
        if (cancelled) return
        setTemplates(list)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [round])

  const saveSelection = async () => {
    const graph = getSelection()
    if (graph.nodes.length === 0) {
      toast.error(t('library.templates.needSelection'))
      return
    }
    const name = window.prompt(t('library.templates.namePrompt'), '')?.trim()
    if (!name) return
    setBusy(true)
    try {
      await canvasService.createTemplate({ name, graph })
      toast.success(t('library.templates.saved', { name, n: graph.nodes.length }))
      setRound((value) => value + 1)
    } catch {
      toast.error(t('library.templates.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const apply = async (template: CanvasTemplateSummary) => {
    setBusy(true)
    try {
      const full = await canvasService.getTemplate(String(template.id))
      const count = onApplyGraph(full.graph as Graph)
      if (count === 0) toast.error(t('library.templates.empty'))
      else toast.success(t('library.templates.applied', { name: template.name, n: count }))
    } catch {
      toast.error(t('library.templates.applyFailed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (template: CanvasTemplateSummary) => {
    if (!window.confirm(t('library.templates.deleteConfirm', { name: template.name }))) return
    try {
      await canvasService.deleteTemplate(String(template.id))
      setTemplates((list) => list.filter((item) => item.id !== template.id))
    } catch {
      toast.error(t('library.templates.deleteFailed'))
    }
  }

  return (
    <details className="cv2-details" open>
      <summary>{t('library.templates.title')}</summary>
      <button type="button" className="cv2-mini-button cv2-mini-primary" disabled={busy} onClick={() => void saveSelection()}>
        <Save className="mr-1 inline h-3 w-3" />
        {t('library.templates.saveSelection')}
      </button>
      {failed ? (
        <p className="cv2-hint">{t('library.loadFailed')}</p>
      ) : loading ? (
        <p className="cv2-hint">{t('library.loading')}</p>
      ) : templates.length === 0 ? (
        <p className="cv2-hint">{t('library.templates.none')}</p>
      ) : (
        templates.map((template) => (
          <div key={String(template.id)} className="cv2-preset cv2-row-card">
            <button type="button" className="cv2-row-card-main" disabled={busy} onClick={() => void apply(template)}>
              <span className="cv2-preset-name">{template.name}</span>
              <span className="cv2-preset-desc">{t('library.templates.nodeCount', { n: template.nodeCount })}</span>
            </button>
            <button
              type="button"
              className="cv2-icon-button"
              title={t('library.templates.delete')}
              onClick={() => void remove(template)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))
      )}
    </details>
  )
}

/** 左侧「素材」标签：模板、资产库、生成日志 */
export function LibraryPanel(props: LibraryPanelProps) {
  return (
    <div className="cv2-sidebar-section">
      <TemplateSection onApplyGraph={props.onApplyGraph} getSelection={props.getSelection} />
      <AssetSection onAddMedia={props.onAddMedia} />
      <LogSection onAddMedia={props.onAddMedia} />
    </div>
  )
}
