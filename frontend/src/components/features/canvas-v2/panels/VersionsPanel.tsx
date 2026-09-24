'use client'

import { Camera, GitCompare, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { useLocale, useTranslations } from '@/i18n/client'
import { canvasService, type CanvasSnapshotSummary } from '@/lib/api/services'

import type { CanvasNode } from '../canvasV2.types'
import { useCanvasStore } from '../store/canvasStore'
import { cleanGraph, diffGraphs, isSameGraph, settleStaleRuns, type Graph, type GraphDiff } from '../store/graphPersist'

/** 对比结果里每一类最多列几个名字，多了给个数 */
const MAX_NAMES = 4

/**
 * 左侧「版本」标签：版本快照。
 * 捕获 = 把此刻整张画布存一份；对比 = 那一版和现在差在哪；恢复 = 回到那一版。
 * 恢复前自动把「现在」也存一份，并且能 Cmd+Z 撤回——恢复不会让人丢东西。
 */
export function VersionsPanel({ boardId }: { boardId: string | null }) {
  const t = useTranslations('canvas')
  const locale = useLocale()
  const commit = useCanvasStore((state) => state.commit)
  const [snapshots, setSnapshots] = useState<CanvasSnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [compare, setCompare] = useState<{ id: string; diff: GraphDiff } | null>(null)

  const time = useCallback(
    (value: string) =>
      new Date(value).toLocaleString(locale, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [locale],
  )

  const reload = useCallback(async () => {
    if (!boardId) return
    try {
      setSnapshots(await canvasService.listSnapshots(boardId))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    let cancelled = false
    if (!boardId) return
    canvasService
      .listSnapshots(boardId)
      .then((list) => {
        if (cancelled) return
        setSnapshots(list)
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
  }, [boardId])

  const currentGraph = (): Graph => {
    const { nodes, edges } = useCanvasStore.getState()
    return cleanGraph(nodes, edges)
  }

  const capture = async (label?: string) => {
    if (!boardId) return false
    await canvasService.createSnapshot(boardId, currentGraph(), label)
    return true
  }

  const nameOf = (node: CanvasNode) => String(node.data?.title ?? t(`nodeKinds.${node.type ?? 'text'}`))
  const names = (list: CanvasNode[]) => {
    const shown = list.slice(0, MAX_NAMES).map(nameOf).join(t('versions.listJoin'))
    return list.length > MAX_NAMES ? t('versions.andMore', { names: shown, n: list.length }) : shown
  }

  if (!boardId) {
    return <p className="cv2-hint">{t('versions.offline')}</p>
  }

  return (
    <div className="cv2-sidebar-section">
      <span className="cv2-kicker">{t('versions.title')}</span>
      <p className="cv2-hint">{t('versions.body')}</p>
      <button
        type="button"
        className="cv2-mini-button cv2-mini-primary"
        disabled={busy}
        onClick={async () => {
          const label = window.prompt(t('versions.labelPrompt'), '')
          if (label === null) return
          setBusy(true)
          try {
            await capture(label.trim() || undefined)
            toast.success(t('versions.created'))
            await reload()
          } catch {
            toast.error(t('versions.createFailed'))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Camera className="mr-1 inline h-3 w-3" />
        {t('versions.create')}
      </button>

      {failed ? (
        <p className="cv2-hint">{t('library.loadFailed')}</p>
      ) : loading ? (
        <p className="cv2-hint">{t('library.loading')}</p>
      ) : snapshots.length === 0 ? (
        <p className="cv2-hint">{t('versions.empty')}</p>
      ) : (
        snapshots.map((snapshot) => {
          const id = String(snapshot.id)
          const open = compare?.id === id
          return (
            <div key={id} className="cv2-snapshot">
              <div className="cv2-snapshot-head">
                <span className="cv2-preset-name">{snapshot.label || time(snapshot.createdAt)}</span>
                <span className="cv2-preset-desc">
                  {snapshot.label ? `${time(snapshot.createdAt)} · ` : ''}
                  {t('versions.counts', { nodes: snapshot.nodeCount, edges: snapshot.edgeCount })}
                </span>
              </div>
              <div className="cv2-snapshot-actions">
                <button
                  type="button"
                  className={open ? 'cv2-mini-button cv2-mini-primary' : 'cv2-mini-button'}
                  disabled={busy}
                  onClick={async () => {
                    if (open) {
                      setCompare(null)
                      return
                    }
                    setBusy(true)
                    try {
                      const full = await canvasService.getSnapshot(id)
                      setCompare({ id, diff: diffGraphs(full.graph as Graph, currentGraph()) })
                    } catch {
                      toast.error(t('versions.loadFailed'))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <GitCompare className="mr-1 inline h-3 w-3" />
                  {t('versions.compare')}
                </button>
                <button
                  type="button"
                  className="cv2-mini-button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(t('versions.restoreConfirm'))) return
                    setBusy(true)
                    try {
                      const full = await canvasService.getSnapshot(id)
                      // 恢复前先把现在的样子存一份，恢复错了还能回来
                      await capture(t('versions.autoBeforeRestore'))
                      const graph = full.graph as Graph
                      commit({ nodes: settleStaleRuns(graph.nodes).nodes, edges: graph.edges })
                      setCompare(null)
                      toast.success(t('versions.restored'))
                      await reload()
                    } catch {
                      toast.error(t('versions.restoreFailed'))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <RotateCcw className="mr-1 inline h-3 w-3" />
                  {t('versions.restore')}
                </button>
                <button
                  type="button"
                  className="cv2-icon-button"
                  title={t('versions.delete')}
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(t('versions.deleteConfirm'))) return
                    try {
                      await canvasService.deleteSnapshot(id)
                      setSnapshots((list) => list.filter((item) => String(item.id) !== id))
                      if (open) setCompare(null)
                    } catch {
                      toast.error(t('versions.deleteFailed'))
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {open && compare && (
                <div className="cv2-diff">
                  {isSameGraph(compare.diff) ? (
                    <p>{t('versions.unchanged')}</p>
                  ) : (
                    <>
                      <p className="cv2-diff-lead">{t('versions.changedLead')}</p>
                      {compare.diff.added.length > 0 && (
                        <p className="cv2-diff-add">
                          {t('versions.added', { n: compare.diff.added.length, names: names(compare.diff.added) })}
                        </p>
                      )}
                      {compare.diff.removed.length > 0 && (
                        <p className="cv2-diff-remove">
                          {t('versions.removed', { n: compare.diff.removed.length, names: names(compare.diff.removed) })}
                        </p>
                      )}
                      {compare.diff.changed.length > 0 && (
                        <p>
                          {t('versions.changed', { n: compare.diff.changed.length, names: names(compare.diff.changed) })}
                        </p>
                      )}
                      {compare.diff.moved > 0 && <p>{t('versions.moved', { n: compare.diff.moved })}</p>}
                      {compare.diff.edgesAdded + compare.diff.edgesRemoved > 0 && (
                        <p>
                          {t('versions.edges', { added: compare.diff.edgesAdded, removed: compare.diff.edgesRemoved })}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
