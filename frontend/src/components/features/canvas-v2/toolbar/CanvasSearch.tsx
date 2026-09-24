'use client'

import { Search } from 'lucide-react'
import { useMemo, useState, type RefObject } from 'react'

import { useTranslations } from '@/i18n/client'

import type { CanvasNode } from '../canvasV2.types'
import { matchSlashCommands, type SlashCommandKey } from '../data/slashCommands'
import { useCanvasStore } from '../store/canvasStore'

/** 搜节点时看哪些字段：标题、类型名，再加各种节点里用户写的字 */
const TEXT_FIELDS = ['text', 'markdown', 'script', 'prompt', 'theme', 'outline']
const MAX_NODE_HITS = 8

export type CanvasAction = { key: string; label: string; run: () => void }

type Hit =
  | { type: 'command'; key: SlashCommandKey; command: string }
  | { type: 'action'; action: CanvasAction }
  | { type: 'node'; node: CanvasNode; label: string; excerpt: string | null }

/**
 * 工具栏上的搜索框：搜节点、搜动作，敲 / 开头就是斜杠命令（/light、/angle）。
 * 回车执行第一条，上下键挑。Cmd/Ctrl+K 从画布任何地方跳进来（快捷键在 CanvasV2Content 里注册）。
 */
export function CanvasSearch({
  inputRef,
  actions,
  onPickNode,
  onSlash,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  actions: CanvasAction[]
  onPickNode: (id: string) => void
  onSlash: (key: SlashCommandKey) => void
}) {
  const t = useTranslations('canvas')
  const nodes = useCanvasStore((state) => state.nodes)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    if (q.startsWith('/')) return matchSlashCommands(q).map((item) => ({ type: 'command', ...item }))

    const actionHits: Hit[] = actions
      .filter((action) => action.label.toLowerCase().includes(q))
      .map((action) => ({ type: 'action', action }))
    const nodeHits: Hit[] = []
    for (const node of nodes) {
      if (nodeHits.length >= MAX_NODE_HITS) break
      const label = String(node.data?.title ?? t(`nodeKinds.${node.type ?? 'text'}`))
      const body = TEXT_FIELDS.map((field) => node.data?.[field])
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join(' ')
      const kindName = t(`nodeKinds.${node.type ?? 'text'}`)
      const haystack = `${label} ${kindName} ${body}`.toLowerCase()
      if (!haystack.includes(q)) continue
      const at = body.toLowerCase().indexOf(q)
      const excerpt = at >= 0 ? body.slice(Math.max(0, at - 12), at + q.length + 24) : null
      nodeHits.push({ type: 'node', node, label, excerpt })
    }
    return [...actionHits, ...nodeHits]
  }, [actions, nodes, query, t])

  const pick = (hit: Hit | undefined) => {
    if (!hit) return
    if (hit.type === 'command') onSlash(hit.key)
    else if (hit.type === 'action') hit.action.run()
    else onPickNode(hit.node.id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const showPanel = open && query.trim() !== ''
  const current = Math.min(active, Math.max(0, hits.length - 1))

  return (
    <div className="cv2-search">
      <Search className="cv2-search-icon h-3.5 w-3.5" />
      <input
        ref={inputRef}
        className="cv2-search-input"
        value={query}
        placeholder={t('search.placeholder')}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // 点候选项时 input 先失焦，推迟一下关面板，否则点击落空
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, hits.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(hits[current])
          } else if (event.key === 'Escape') {
            setQuery('')
            inputRef.current?.blur()
          }
        }}
      />
      {showPanel && (
        <div className="cv2-search-panel" role="listbox">
          {hits.length === 0 ? (
            <p className="cv2-search-empty">
              {query.trim().startsWith('/') ? t('search.noCommand') : t('search.empty')}
            </p>
          ) : (
            hits.map((hit, index) => (
              <button
                key={hit.type === 'node' ? hit.node.id : hit.type === 'action' ? hit.action.key : hit.key}
                type="button"
                role="option"
                aria-selected={index === current}
                className={index === current ? 'cv2-search-item cv2-search-item-active' : 'cv2-search-item'}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(hit)}
              >
                {hit.type === 'command' && (
                  <>
                    <span className="cv2-search-tag">{hit.command}</span>
                    <span className="cv2-search-main">
                      {hit.key === 'light' ? t('slash.light.label') : t('slash.angle.label')}
                    </span>
                    <span className="cv2-search-sub">
                      {hit.key === 'light' ? t('slash.light.description') : t('slash.angle.description')}
                    </span>
                  </>
                )}
                {hit.type === 'action' && (
                  <>
                    <span className="cv2-search-tag">{t('search.action')}</span>
                    <span className="cv2-search-main">{hit.action.label}</span>
                  </>
                )}
                {hit.type === 'node' && (
                  <>
                    <span className="cv2-search-tag">{t(`nodeKinds.${hit.node.type ?? 'text'}`)}</span>
                    <span className="cv2-search-main">{hit.label}</span>
                    {hit.excerpt && <span className="cv2-search-sub">{hit.excerpt}</span>}
                  </>
                )}
              </button>
            ))
          )}
          <p className="cv2-search-hint">{t('search.hint')}</p>
        </div>
      )}
    </div>
  )
}
