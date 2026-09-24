'use client'

import { type NodeProps } from '@xyflow/react'

import { useTranslations } from '@/i18n/client'

import { BUILTIN_PROMPT_SNIPPETS, groupSnippetsByCategory } from '../data/promptLibrary'
import { useCanvasStore } from '../store/canvasStore'
import { NodeShell } from './NodeShell'

/** 结构类节点：提示词组、导演台、脚本、视频拼接 */

function useNodePatch(id: string) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  return (patch: Record<string, unknown>) => updateNodeData(id, patch)
}

/** 一组可复用的提示词片段，连到生成器上就等于给它加料 */
export function PromptGroupNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const snippetIds = (data.snippetIds as string[]) ?? []
  const groups = groupSnippetsByCategory(BUILTIN_PROMPT_SNIPPETS)

  const toggle = (snippetId: string) =>
    patch({
      snippetIds: snippetIds.includes(snippetId)
        ? snippetIds.filter((item) => item !== snippetId)
        : [...snippetIds, snippetId],
    })

  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.promptGroup'))}
      selected={selected}
      width={300}
      badge={snippetIds.length > 0 ? t('node.promptGroup.badge', { count: snippetIds.length }) : undefined}
    >
      {[...groups.entries()].map(([category, snippets]) => (
        <div key={category} className="cv2-field">
          <span className="cv2-field-label">{t(`snippets.categories.${category}`)}</span>
          <div className="cv2-chips">
            {snippets.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                title={snippet.content}
                aria-pressed={snippetIds.includes(snippet.id)}
                className={snippetIds.includes(snippet.id) ? 'cv2-chip cv2-chip-active' : 'cv2-chip'}
                onClick={() => toggle(snippet.id)}
              >
                {/* 用户自己收藏的条目带 name（他打的字，不翻译）；内置的按 id 查 i18n */}
                {snippet.name ?? t(`snippets.items.${snippet.id}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </NodeShell>
  )
}

/** 导演台：填主题和大纲，产出分镜脚本 */
export function DirectorNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  return (
    <NodeShell title={String(data.title ?? t('nodeKinds.director'))} selected={selected} width={320}>
      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.director.theme')}</span>
        <input
          className="cv2-input"
          value={String(data.theme ?? '')}
          placeholder={t('node.director.themePlaceholder')}
          onChange={(event) => patch({ theme: event.target.value })}
        />
      </div>
      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.director.outline')}</span>
        <textarea
          className="cv2-textarea"
          rows={5}
          value={String(data.outline ?? '')}
          placeholder={t('node.director.outlinePlaceholder')}
          onChange={(event) => patch({ outline: event.target.value })}
        />
      </div>
      <p className="cv2-hint">{t('node.director.hint')}</p>
    </NodeShell>
  )
}

export function ScriptNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  return (
    <NodeShell title={String(data.title ?? t('nodeKinds.script'))} selected={selected} width={320}>
      <textarea
        className="cv2-textarea cv2-mono"
        rows={8}
        value={String(data.script ?? '')}
        placeholder={t('node.script.placeholder')}
        onChange={(event) => patch({ script: event.target.value })}
      />
    </NodeShell>
  )
}

/** 视频拼接：把上游的视频节点按连线顺序接成一条 */
export function VideoStitchNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const edges = useCanvasStore((state) => state.edges)
  const clips = edges.filter((edge) => edge.target === id).length
  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.videoStitch'))}
      selected={selected}
      width={260}
      badge={t('node.videoStitch.badge', { count: clips })}
    >
      <p className="cv2-hint">{t('node.videoStitch.hint')}</p>
      <p className="cv2-hint">{t('node.videoStitch.blocked')}</p>
    </NodeShell>
  )
}
