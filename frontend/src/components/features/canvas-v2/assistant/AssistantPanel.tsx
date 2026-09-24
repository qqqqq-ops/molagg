'use client'

import { Send, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { useTranslations } from '@/i18n/client'

import { useCanvasStore } from '../store/canvasStore'
import { useAssistant } from './useAssistant'

/**
 * 左侧「助手」：上半是选中节点的详情，下半是指挥对话框。
 *
 * 参考站是「AI 助手 — 对话式自动操作画布 (建/连/改节点 + 生成)」。
 * 我们这版**去掉了「生成」**：助手只建节点、连线、填参数，
 * 那个 ▶ 还是由人按——跑一次是真花钱的，不该让模型自己决定。
 */

/** 节点上有哪些值得在详情里显示的字段 */
const SHOWN_FIELDS = [
  'prompt',
  'aspectRatio',
  'durationSeconds',
  'outputCount',
  'angleKeys',
  'snippetIds',
  'shotSizeKey',
  'cameraHeightKey',
  'lightingPresetKey',
] as const

function NodeInspector() {
  const t = useTranslations('canvas')
  const nodes = useCanvasStore((state) => state.nodes)
  const selected = useMemo(() => nodes.filter((node) => node.selected), [nodes])

  if (selected.length === 0) {
    return <p className="cv2-hint">{t('assistant.noSelection')}</p>
  }
  if (selected.length > 1) {
    return <p className="cv2-hint">{t('assistant.multiSelection', { count: selected.length })}</p>
  }

  const node = selected[0]
  const data = (node.data ?? {}) as Record<string, unknown>
  type InspectorRow = { field: (typeof SHOWN_FIELDS)[number]; text: string }
  const rows = SHOWN_FIELDS.reduce<InspectorRow[]>((acc, field) => {
    const value = data[field]
    if (value === null || value === undefined || value === '') return acc
    const text = Array.isArray(value) ? value.join('、') : String(value)
    if (text) acc.push({ field, text })
    return acc
  }, [])

  return (
    <div className="cv2-inspector">
      <div className="cv2-inspector-head">
        <span className="cv2-inspector-title">
          {String(data.title ?? t(`nodeKinds.${node.type ?? 'text'}`))}
        </span>
        <span className="cv2-inspector-kind">{t(`nodeKinds.${node.type ?? 'text'}`)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="cv2-hint">{t('assistant.nodeEmpty')}</p>
      ) : (
        <dl className="cv2-inspector-rows">
          {rows.map((row) => (
            <div key={row.field} className="cv2-inspector-row">
              <dt>{t(`assistant.field.${row.field}`)}</dt>
              <dd title={row.text}>{row.text}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="cv2-hint">{t('assistant.selectedHint')}</p>
    </div>
  )
}

export function AssistantPanel() {
  const t = useTranslations('canvas')
  const { models, modelId, setModelId, turns, busy, send, reset } = useAssistant()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const submit = () => {
    if (!draft.trim() || busy) return
    void send(draft)
    setDraft('')
    // 发完滚到底；用 requestAnimationFrame 等这一帧渲染完
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }))
  }

  return (
    <div className="cv2-assistant">
      <div className="cv2-sidebar-section">
        <span className="cv2-kicker">{t('assistant.inspector')}</span>
        <NodeInspector />
      </div>

      <div className="cv2-sidebar-section cv2-assistant-chat">
        <span className="cv2-kicker">{t('assistant.title')}</span>

        <div className="cv2-field">
          <span className="cv2-field-label">{t('assistant.model')}</span>
          <select
            className="cv2-select"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            disabled={busy}
          >
            <option value="">
              {models === null
                ? t('node.generator.modelLoading')
                : models.length
                  ? t('node.generator.modelPick')
                  : t('assistant.noTextModel')}
            </option>
            {(models ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="cv2-assistant-log" ref={listRef}>
          {turns.length === 0 ? (
            <p className="cv2-hint">{t('assistant.empty')}</p>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === 'user'
                    ? 'cv2-bubble cv2-bubble-user'
                    : turn.failed
                      ? 'cv2-bubble cv2-bubble-failed'
                      : 'cv2-bubble'
                }
              >
                <p>{turn.text}</p>
                {turn.applied && (turn.applied.added.length || turn.applied.changed || turn.applied.connected || turn.applied.removed) ? (
                  <p className="cv2-bubble-meta">
                    {t('assistant.applied', {
                      added: turn.applied.added.length,
                      changed: turn.applied.changed,
                      connected: turn.applied.connected,
                      removed: turn.applied.removed,
                    })}
                  </p>
                ) : null}
                {turn.rejected?.length ? (
                  <p className="cv2-bubble-meta cv2-bubble-warn" title={turn.rejected.join('\n')}>
                    {t('assistant.rejected', { count: turn.rejected.length })}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>

        <textarea
          className="cv2-textarea"
          rows={3}
          value={draft}
          disabled={busy || !modelId}
          placeholder={t('assistant.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter 发送，Shift+Enter 换行——跟站里聊天页一致
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <div className="cv2-assistant-actions">
          <button type="button" className="cv2-mini-button" onClick={reset} disabled={busy || turns.length === 0}>
            <Trash2 className="h-3 w-3" />
            {t('assistant.clear')}
          </button>
          <button
            type="button"
            className="cv2-mini-button cv2-mini-primary"
            onClick={submit}
            disabled={busy || !draft.trim() || !modelId}
          >
            <Send className="h-3 w-3" />
            {busy ? t('assistant.sending') : t('assistant.send')}
          </button>
        </div>

        <p className="cv2-hint">{t('assistant.noRunHint')}</p>
      </div>
    </div>
  )
}
