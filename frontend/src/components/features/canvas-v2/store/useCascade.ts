'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useTranslations } from '@/i18n/client'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

import type { CanvasNode } from '../canvasV2.types'
import { useCanvasStore } from './canvasStore'
import { collectUpstreamInputs } from './graphInputs'
import { planCascade, RUNNABLE_KINDS } from './graphOps'
import { findMaterialIssue } from './materialCheck'
import { useRunner } from './runnerContext'
import { buildRunOptions, plannedTaskCount, runModeOf } from './runOptions'

/** 预检不过时，提示里最多列几条，多了只给个数 */
const MAX_LISTED_ISSUES = 3

/**
 * 级联执行：按连线的先后把整张画布的生成节点一批批跑完。
 *
 * - 先预检（有没有选模型、写提示词、素材收不收），有一个不过就一个都不提交；
 * - 再弹确认框说清楚要提交几个任务——每个都是真金白银的上游调用，那一下必须由人按；
 * - 一批跑完、出了结果再跑下一批（下一批要用上一批的产出）；有节点没成功就停。
 */
export function useCascade(models: { image: ModelWithCapabilities[]; video: ModelWithCapabilities[] }) {
  const t = useTranslations('canvas')
  const { run, cancelAll } = useRunner()
  const [progress, setProgress] = useState<{ batch: number; total: number } | null>(null)
  const cancelled = useRef(false)

  const nameOf = useCallback(
    (node: CanvasNode) => String(node.data?.title ?? t(`nodeKinds.${node.type ?? 'text'}`)),
    [t],
  )

  /** 跑之前逐个检查；下游的素材要等上游出图才有，这里按「上游是生成器 = 会有一张图」估 */
  const preflight = useCallback(
    (nodes: CanvasNode[], ids: string[]) => {
      const { edges } = useCanvasStore.getState()
      const byId = new Map(nodes.map((node) => [node.id, node]))
      const issues: string[] = []
      for (const id of ids) {
        const node = byId.get(id)
        const mode = node ? runModeOf(node) : null
        if (!node || !mode) continue
        const model = models[mode].find((item) => item.id === String(node.data?.modelId ?? ''))
        if (!model) {
          issues.push(t('cascade.issueNoModel', { name: nameOf(node) }))
          continue
        }
        if (!String(node.data?.prompt ?? '').trim()) issues.push(t('cascade.issueNoPrompt', { name: nameOf(node) }))

        const inputs = collectUpstreamInputs(id, nodes, edges)
        const upstreamImageGenerators = edges.filter(
          (edge) => edge.target === id && byId.get(edge.source)?.type === 'imageGenerator',
        ).length
        const issue = findMaterialIssue(model, {
          images: inputs.imageUrls.length + upstreamImageGenerators,
          videos: inputs.videoUrls.length,
          audios: inputs.audioUrls.length,
        })
        if (issue?.reason === 'unsupported') {
          issues.push(t('cascade.issueMaterial', { name: nameOf(node), kind: t(`materialKind.${issue.kind}`) }))
        }
      }
      return issues
    },
    [models, nameOf, t],
  )

  const start = useCallback(async () => {
    if (progress) return
    const { nodes, edges } = useCanvasStore.getState()
    const plan = planCascade(nodes, edges)
    if (!plan.ok) {
      toast.error(t('cascade.emptyOrCyclic'))
      return
    }

    const all = plan.batches.flat()
    const issues = preflight(nodes, all)
    if (issues.length > 0) {
      const listed = issues.slice(0, MAX_LISTED_ISSUES).join(t('cascade.listJoin'))
      toast.error(t('cascade.blocked', { count: issues.length }), {
        description: issues.length > MAX_LISTED_ISSUES ? `${listed}${t('cascade.andMore')}` : listed,
        duration: 10000,
      })
      return
    }

    const byId = new Map(nodes.map((node) => [node.id, node]))
    const tasks = all.reduce((sum, id) => {
      const node = byId.get(id)
      const mode = node ? runModeOf(node) : null
      const options = node && mode ? buildRunOptions(node, models[mode]) : null
      return sum + (options ? plannedTaskCount(options) : 0)
    }, 0)
    if (!window.confirm(t('cascade.confirm', { nodes: all.length, tasks, batches: plan.batches.length }))) return

    cancelled.current = false
    toast.success(t('cascade.started', { n: plan.batches.length }))

    for (let index = 0; index < plan.batches.length; index += 1) {
      if (cancelled.current) break
      setProgress({ batch: index + 1, total: plan.batches.length })
      // 每批开跑前重新取一次画布：上一批刚落下的结果要算进下游的输入
      const current = useCanvasStore.getState().nodes
      const outcomes = await Promise.all(
        plan.batches[index].map((id) => {
          const node = current.find((item) => item.id === id)
          const mode = node ? runModeOf(node) : null
          if (!node || !mode || !RUNNABLE_KINDS.has(node.type ?? '')) return Promise.resolve('cancelled' as const)
          const options = buildRunOptions(node, models[mode])
          return options ? run(options) : Promise.resolve('blocked' as const)
        }),
      )
      if (cancelled.current) break
      if (outcomes.some((outcome) => outcome !== 'completed')) {
        setProgress(null)
        toast.error(t('cascade.stopped', { batch: index + 1 }))
        return
      }
    }

    setProgress(null)
    if (!cancelled.current) toast.success(t('cascade.done', { n: plan.batches.length }))
  }, [models, preflight, progress, run, t])

  const cancel = useCallback(() => {
    cancelled.current = true
    cancelAll()
    setProgress(null)
    toast.success(t('cascade.cancelled'))
  }, [cancelAll, t])

  return { start, cancel, progress }
}
