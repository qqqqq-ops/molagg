'use client'

import { useCallback, useEffect, useState } from 'react'

import { chatService, modelService } from '@/lib/api/services'
import type { AiModel } from '@/lib/api/types/models'

import { useCanvasStore } from '../store/canvasStore'
import { applyAssistantActions, parseAssistantActions, type ApplyResult } from './assistantActions'
import { buildAssistantMessage, buildCanvasDigest } from './canvasDigest'

/**
 * 助手：把一句话交给文本模型，拿回一批动作，落到画布上。
 *
 * 复用站里现成的会话接口（`/chat/conversations`）而不是另起一套：
 * 渠道路由、计费、失败分类都在那条路上，另写一份就得再维护一遍。
 * 会话**一个画布页只建一次**，这样连续几句话模型记得上文。
 */

export type AssistantTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** 助手这一轮实际改了什么，显示在气泡下面 */
  applied?: ApplyResult
  /** 被丢掉的动作原因 */
  rejected?: string[]
  failed?: boolean
}

let seq = 0
const nextId = () => `turn-${Date.now().toString(36)}-${(seq += 1)}`

export function useAssistant() {
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [modelId, setModelId] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    modelService
      .getModels({ type: 'chat' })
      .then((list) => {
        if (cancelled) return
        setModels(list)
        // 默认选第一个；用户可以改
        if (list.length > 0) setModelId((current) => current || list[0].id)
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(
    async (instruction: string) => {
      const text = instruction.trim()
      if (!text || busy || !modelId) return

      const userTurn: AssistantTurn = { id: nextId(), role: 'user', text }
      setTurns((prev) => [...prev, userTurn])
      setBusy(true)

      try {
        let cid = conversationId
        if (!cid) {
          const conversation = await chatService.createConversation({ modelId })
          cid = conversation.id
          setConversationId(cid)
        }

        // 每一轮都重新描述画布：上一轮之后用户可能自己动过
        const { nodes, edges } = useCanvasStore.getState()
        const selected = nodes.filter((node) => node.selected).map((node) => node.id)
        const digest = buildCanvasDigest(nodes, edges, selected)

        const response = await chatService.sendMessage(cid, {
          content: buildAssistantMessage(digest, text),
        })
        const reply = response.assistantMessage?.content ?? ''

        const { actions, rejected } = parseAssistantActions(
          reply,
          useCanvasStore.getState().nodes.map((node) => node.id),
        )

        const store = useCanvasStore.getState()
        // 新节点放在现有节点右边，别盖住已有的
        const maxX = store.nodes.reduce((acc, node) => Math.max(acc, node.position.x), 0)
        const applied = applyAssistantActions(actions, {
          addNode: store.addNode,
          updateNodeData: store.updateNodeData,
          connect: (from, to) => store.onConnect({ source: from, target: to, sourceHandle: null, targetHandle: null }),
          removeNodes: store.removeNodes,
          origin: { x: maxX + 420, y: 0 },
        })

        // 模型那句给人看的话；没有就退回原文
        const spoken = readReply(reply) ?? reply.trim()
        setTurns((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: spoken, applied, rejected },
        ])
      } catch (error) {
        setTurns((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: error instanceof Error ? error.message : String(error),
            failed: true,
          },
        ])
      } finally {
        setBusy(false)
      }
    },
    [busy, conversationId, modelId],
  )

  const reset = useCallback(() => {
    setTurns([])
    setConversationId(null)
  }, [])

  return { models, modelId, setModelId, turns, busy, send, reset }
}

/** 从模型回复里取 `reply` 字段；取不到返回 null，调用方自己兜底 */
function readReply(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  try {
    const match = raw.slice(start).match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (!match) return null
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return null
  }
}
