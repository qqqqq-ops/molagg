'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useTranslations } from '@/i18n/client'
import { canvasService } from '@/lib/api/services'

import type { CanvasEdge, CanvasNode } from '../canvasV2.types'
import { useCanvasStore } from './canvasStore'
import { cleanGraph, settleStaleRuns } from './graphPersist'

/** 停手这么久之后存一次；拖节点时每帧都在变，不能每次都存 */
const SAVE_DELAY_MS = 1500

/**
 * - loading：正在读存着的画布
 * - saved / saving / failed：自动保存的状态
 * - offline：读不到（没登录 / 后端没开）——画布照样能用，只是不会自动保存
 */
export type SaveState = 'loading' | 'saved' | 'saving' | 'failed' | 'offline'

/**
 * 画布自动保存：打开页面时读回上次的画布，之后一有改动（停手 1.5 秒）就存。
 * 版本快照要挂在这张画布上，所以把 boardId 交出去。
 */
export function useBoardSync() {
  const t = useTranslations('canvas')
  const hydrate = useCanvasStore((state) => state.hydrate)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>('loading')
  /** 上次存上去的内容，一样就不重复存（选中 / 取消选中也会触发变化） */
  const lastSaved = useRef('')
  const timer = useRef<number | null>(null)
  const inflight = useRef(false)
  const again = useRef(false)
  // 提示文案跟着语言走，但切语言不能触发重新读盘（会把没存的改动盖掉），所以 t 走 ref
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  // 只在打开页面时读一次
  useEffect(() => {
    let cancelled = false
    canvasService
      .getCurrentBoard()
      .then((board) => {
        if (cancelled) return
        const local = useCanvasStore.getState()
        const storedNodes = (board.graph?.nodes ?? []) as CanvasNode[]
        // 读回来之前用户已经动手画了、存着的又是空的：保留手上的，接下来照常存
        if (storedNodes.length > 0 || local.nodes.length === 0) {
          const settled = settleStaleRuns(storedNodes)
          hydrate(settled.nodes, (board.graph?.edges ?? []) as CanvasEdge[])
          // 取最新语言的 t。变量名保持叫 t：checks/test-i18n 是按这个名字静态收集文案 key 的
          const t = tRef.current
          if (settled.resumable.length > 0) {
            // 留着 taskId 的交给 useNodeRun（provider 内）重新接回轮询：还在跑就继续显示、已出片就自动落节点
            useCanvasStore.getState().setPendingReattach(settled.resumable)
            toast.info(t('board.reattaching', { count: settled.resumable.length }))
          }
          const unrecoverable = settled.count - settled.resumable.length
          if (unrecoverable > 0) toast.info(t('board.staleRuns', { count: unrecoverable }))
          lastSaved.current = JSON.stringify(cleanGraph(settled.nodes, (board.graph?.edges ?? []) as CanvasEdge[]))
        }
        setBoardId(String(board.id))
        setState('saved')
      })
      .catch(() => {
        if (!cancelled) setState('offline')
      })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  // 画布一变就排一次保存；停手 1.5 秒才真的发
  useEffect(() => {
    if (!boardId) return

    const save = async (): Promise<void> => {
      if (inflight.current) {
        // 正在存：记一笔，存完再补一次，保证最后的样子一定落盘
        again.current = true
        return
      }
      const { nodes, edges } = useCanvasStore.getState()
      const graph = cleanGraph(nodes, edges)
      const json = JSON.stringify(graph)
      if (json === lastSaved.current) {
        setState('saved')
        return
      }
      inflight.current = true
      setState('saving')
      try {
        await canvasService.saveBoard(boardId, graph)
        lastSaved.current = json
        setState('saved')
      } catch {
        setState('failed')
      } finally {
        inflight.current = false
        if (again.current) {
          again.current = false
          void save()
        }
      }
    }

    const unsubscribe = useCanvasStore.subscribe((current, previous) => {
      if (current.nodes === previous.nodes && current.edges === previous.edges) return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS)
    })
    // 切走标签页 / 关页面前赶紧存一下（尽力而为）
    const flush = () => {
      if (document.visibilityState !== 'hidden') return
      if (timer.current) window.clearTimeout(timer.current)
      void save()
    }
    document.addEventListener('visibilitychange', flush)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', flush)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [boardId])

  return { boardId, saveState: state }
}
