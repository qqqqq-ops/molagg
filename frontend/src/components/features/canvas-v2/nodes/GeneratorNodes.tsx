'use client'

import { type NodeProps } from '@xyflow/react'
import { Play, RotateCcw } from 'lucide-react'
import { useMemo } from 'react'

import { getAspectRatioOptions, getImageSizeOptions } from '@/components/features/create/config/aspectRatioOptions'
import { clampOutputCount, getOutputCountConfig } from '@/components/features/create/config/outputCountOptions'
import { TaskProgress } from '@/components/shared/TaskProgress'
import { useTranslations } from '@/i18n/client'

import { BUILTIN_PROMPT_SNIPPETS, groupSnippetsByCategory } from '../data/promptLibrary'
import {
  CAMERA_HEIGHTS,
  CHARACTER_ANGLES,
  LIGHTING_PRESETS,
  LIGHT_BRIGHTNESS,
  LIGHT_COLORS,
  LIGHT_POSITIONS,
  SHOT_SIZES,
  type ShotChoice,
  type ShotOption,
} from '../data/shotOptions'
import { useCanvasStore } from '../store/canvasStore'
import { collectUpstreamInputs, summarizeInputs } from '../store/graphInputs'
import { useMediaModels } from '@/lib/hooks/useMediaModels'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { useRunner } from '../store/runnerContext'
import { buildRunOptions } from '../store/runOptions'
import { NodeShell } from './NodeShell'

/**
 * 画幅选项按厂商来：GPT Image / Qwen / 豆包用像素尺寸（getImageSizeOptions 有值），
 * 其余用比例。写死一套 ['1:1','16:9'…] 发过去，对一半厂商都是无效参数。
 */
function useAspectOptions(provider: string | undefined, mode: 'image' | 'video') {
  const t = useTranslations('canvas')
  return useMemo(() => {
    // 画幅选项的名字基本是数字（1024×1024、16:9），本来就跟语言无关；
    // 只有 value 为空的那一项写的是「默认」，这一项按当前语言换掉。
    // （aspectRatioOptions 是创作页共用的，整份走 i18n 是另一件事，不在画布这一步做。）
    const localize = (option: { value: string; label: string }) => ({
      key: option.value,
      label: option.value === '' ? t('node.generator.defaultOption') : option.label,
    })
    const sizeOptions = mode === 'image' ? getImageSizeOptions(provider) : null
    if (sizeOptions?.length) {
      return { kind: 'size' as const, options: sizeOptions.map(localize) }
    }
    return { kind: 'ratio' as const, options: getAspectRatioOptions(provider).map(localize) }
  }, [provider, mode, t])
}

/** 把只有 key 的镜头选项配上当前语言的名字 */
function useShotChoices(list: ShotOption[], group: string): ShotChoice[] {
  const t = useTranslations('canvas')
  return useMemo(
    () =>
      list.map((option) => ({
        key: option.key,
        label: t(`shot.${group}.${option.key}`),
        swatch: (option as { swatch?: string }).swatch,
      })),
    [list, group, t],
  )
}

/** 成套布光方案额外带一句说明，显示在 chip 的 title 上 */
function useLightingPresetChoices(): ShotChoice[] {
  const t = useTranslations('canvas')
  return useMemo(
    () =>
      LIGHTING_PRESETS.map((preset) => ({
        key: preset.key,
        label: t(`shot.lightingPresets.${preset.key}.label`),
        description: t(`shot.lightingPresets.${preset.key}.description`),
      })),
    [t],
  )
}

/** 运行按钮：参数统一由 buildRunOptions 从节点数据拼，跟级联执行走同一份 */
function runNode(run: ReturnType<typeof useRunner>['run'], id: string, models: ModelWithCapabilities[]) {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === id)
  const options = node ? buildRunOptions(node, models) : null
  if (options) void run(options)
}

function useNodePatch(id: string) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  return (patch: Record<string, unknown>) => updateNodeData(id, patch)
}

/** 多选标签条：勾选 / 取消勾选 */
function ChipGroup({
  options,
  selected,
  onToggle,
  single = false,
}: {
  options: ShotChoice[]
  selected: string[]
  onToggle: (key: string) => void
  single?: boolean
}) {
  return (
    <div className="cv2-chips">
      {options.map((option) => {
        const active = selected.includes(option.key)
        return (
          <button
            key={option.key}
            type="button"
            title={option.description}
            className={active ? 'cv2-chip cv2-chip-active' : 'cv2-chip'}
            aria-pressed={active}
            onClick={() => onToggle(single && active ? '' : option.key)}
          >
            {option.swatch && <i className="cv2-chip-swatch" style={{ background: option.swatch }} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 连进这个节点的上游素材摘要。画布的卖点是关联一目了然，所以必须显示出来 */
function UpstreamSummary({ nodeId }: { nodeId: string }) {
  const t = useTranslations('canvas')
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const parts = useMemo(() => summarizeInputs(collectUpstreamInputs(nodeId, nodes, edges)), [nodeId, nodes, edges])
  if (parts.length === 0) return null
  // summarizeInputs 只给「几项、各多少」，量词在这里按语言拼
  const summary = parts.map((part) => t(`upstream.${part.kind}`, { count: part.count })).join(' · ')
  return <p className="cv2-upstream">{t('upstream.prefix', { summary })}</p>
}

/** 生成数量：同一份输入跑几遍。可选范围按模型给（见 outputCountOptions） */
function OutputCountField({
  provider,
  mode,
  value,
  onChange,
}: {
  provider: string | undefined
  mode: 'image' | 'video'
  value: number
  onChange: (count: number) => void
}) {
  const t = useTranslations('canvas')
  const config = useMemo(() => getOutputCountConfig(provider, mode), [provider, mode])
  // 换模型后原来选的数量可能超范围，显示时夹一下（派生，不写回 state）
  const current = clampOutputCount(value, config)
  const note = config.noteKey ? t(`node.generator.outputNote.${config.noteKey}`) : null
  if (config.options.length <= 1) {
    return note ? <p className="cv2-hint">{note}</p> : null
  }
  return (
    <div className="cv2-field">
      <span className="cv2-field-label">{t('node.generator.outputCount')}</span>
      <ChipGroup
        options={config.options.map((count) => ({
          key: String(count),
          label: t('node.generator.outputCountUnit', { count }),
        }))}
        selected={[String(current)]}
        single
        onToggle={(key) => key && onChange(Number(key))}
      />
      <p className="cv2-hint">{note ?? t('node.generator.outputCountHint')}</p>
    </div>
  )
}

function GeneratorStatus({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations('canvas')
  const status = String(data.status ?? 'idle')
  if (status === 'failed') {
    return <p className="cv2-error">{String(data.errorMessage ?? t('node.generator.failed'))}</p>
  }
  if (status === 'idle' || status === 'completed') return null
  return (
    <TaskProgress
      status={status as 'submitting' | 'pending' | 'processing'}
      type={data.durationSeconds !== undefined ? 'video' : 'image'}
      createdAt={data.startedAt ? String(data.startedAt) : null}
      progress={typeof data.progress === 'number' ? data.progress : null}
      modelId={data.modelId ? String(data.modelId) : null}
    />
  )
}

/** 素材库勾选面板，图片节点隐藏「运镜」那一组（对静态图没意义） */
function SnippetPicker({
  selected,
  onToggle,
  hideCamera,
}: {
  selected: string[]
  onToggle: (id: string) => void
  hideCamera?: boolean
}) {
  const t = useTranslations('canvas')
  const groups = useMemo(() => groupSnippetsByCategory(BUILTIN_PROMPT_SNIPPETS), [])
  return (
    <details className="cv2-details">
      <summary>
        {t('node.generator.snippets')} {selected.length > 0 && <span className="cv2-count">{selected.length}</span>}
      </summary>
      {[...groups.entries()].map(([category, snippets]) => {
        if (hideCamera && category === 'camera') return null
        return (
          <div key={category} className="cv2-field">
            <span className="cv2-field-label">{t(`snippets.categories.${category}`)}</span>
            <ChipGroup
              options={snippets.map((s) => ({
                key: s.id,
                // 用户自己收藏的带 name（他打的字，不翻译）；内置的按 id 查 i18n
                label: s.name ?? t(`snippets.items.${s.id}`),
                description: s.content,
              }))}
              selected={selected}
              onToggle={onToggle}
            />
          </div>
        )
      })}
    </details>
  )
}

export function ImageGeneratorNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const { models, loading } = useMediaModels('image')
  const { run } = useRunner()
  const running = ['submitting', 'pending', 'processing'].includes(String(data.status ?? 'idle'))

  const angleKeys = (data.angleKeys as string[]) ?? []
  const snippetIds = (data.snippetIds as string[]) ?? []
  const lightPositionKeys = (data.lightPositionKeys as string[]) ?? []
  const model = models.find((item) => item.id === String(data.modelId ?? '')) ?? null
  const aspect = useAspectOptions(model?.provider, 'image')

  const angleChoices = useShotChoices(CHARACTER_ANGLES, 'angles')
  const lightingChoices = useLightingPresetChoices()
  const lightPositionChoices = useShotChoices(LIGHT_POSITIONS, 'lightPositions')
  const lightColorChoices = useShotChoices(LIGHT_COLORS, 'lightColors')
  const lightBrightnessChoices = useShotChoices(LIGHT_BRIGHTNESS, 'lightBrightness')
  const shotSizeChoices = useShotChoices(SHOT_SIZES, 'shotSizes')
  const cameraHeightChoices = useShotChoices(CAMERA_HEIGHTS, 'cameraHeights')

  const toggle = (field: string, list: string[]) => (key: string) =>
    patch({ [field]: key === '' ? [] : list.includes(key) ? list.filter((k) => k !== key) : [...list, key] })

  const pickSingle = (field: string, current: unknown) => (key: string) =>
    patch({ [field]: key === '' || key === current ? null : key })

  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.imageGenerator'))}
      selected={selected}
      width={340}
      badge={
        angleKeys.length > 1 ? t('node.imageGenerator.multiAngleBadge', { count: angleKeys.length }) : undefined
      }
      actions={
        <button
          type="button"
          className="cv2-icon-button"
          disabled={running}
          title={running ? t('node.generator.running') : t('node.imageGenerator.run')}
          onClick={() => runNode(run, id, models)}
        >
          {running ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      }
    >
      <textarea
        className="cv2-textarea"
        rows={3}
        value={String(data.prompt ?? '')}
        placeholder={t('node.imageGenerator.placeholder')}
        onChange={(event) => patch({ prompt: event.target.value })}
      />

      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.generator.model')}</span>
        <select
          className="cv2-select"
          value={data.modelId ? String(data.modelId) : ''}
          onChange={(event) => patch({ modelId: event.target.value || null })}
        >
          <option value="">
            {loading
              ? t('node.generator.modelLoading')
              : models.length
                ? t('node.generator.modelPick')
                : t('node.generator.modelEmpty')}
          </option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      <div className="cv2-field">
        <span className="cv2-field-label">
          {aspect.kind === 'size' ? t('node.generator.size') : t('node.generator.ratio')}
        </span>
        {model ? (
          <ChipGroup
            options={aspect.options}
            selected={data.aspectRatio ? [String(data.aspectRatio)] : []}
            single
            onToggle={(key) => patch({ aspectRatio: key || null })}
          />
        ) : (
          <p className="cv2-hint">{t('node.generator.pickModelFirst')}</p>
        )}
      </div>

      <OutputCountField
        provider={model?.provider}
        mode="image"
        value={Number(data.outputCount ?? 1)}
        onChange={(count) => patch({ outputCount: count })}
      />

      <details className="cv2-details">
        <summary>
          {t('node.imageGenerator.multiAngle')}{' '}
          {angleKeys.length > 0 && <span className="cv2-count">{angleKeys.length}</span>}
        </summary>
        <p className="cv2-hint">{t('node.imageGenerator.multiAngleHint')}</p>
        <ChipGroup options={angleChoices} selected={angleKeys} onToggle={toggle('angleKeys', angleKeys)} />
      </details>

      <details className="cv2-details">
        <summary>{t('node.imageGenerator.lighting')}</summary>
        <span className="cv2-field-label">{t('node.imageGenerator.lightingPreset')}</span>
        <ChipGroup
          options={lightingChoices}
          selected={data.lightingPresetKey ? [String(data.lightingPresetKey)] : []}
          single
          onToggle={(key) => {
            if (!key) {
              patch({ lightingPresetKey: null })
              return
            }
            // 选成套方案 = 把位置 / 色温 / 软硬一次填好，之后还能单独改
            const preset = LIGHTING_PRESETS.find((item) => item.key === key)
            if (!preset) return
            patch({
              lightingPresetKey: key,
              lightPositionKeys: preset.positions,
              lightColorKey: preset.defaultColor,
              lightBrightnessKey: preset.defaultBrightness,
            })
          }}
        />
        <span className="cv2-field-label">{t('node.imageGenerator.lightPosition')}</span>
        <ChipGroup
          options={lightPositionChoices}
          selected={lightPositionKeys}
          onToggle={toggle('lightPositionKeys', lightPositionKeys)}
        />
        <span className="cv2-field-label">{t('node.imageGenerator.lightColor')}</span>
        <ChipGroup
          options={lightColorChoices}
          selected={data.lightColorKey ? [String(data.lightColorKey)] : []}
          single
          onToggle={pickSingle('lightColorKey', data.lightColorKey)}
        />
        <span className="cv2-field-label">{t('node.imageGenerator.lightBrightness')}</span>
        <ChipGroup
          options={lightBrightnessChoices}
          selected={data.lightBrightnessKey ? [String(data.lightBrightnessKey)] : []}
          single
          onToggle={pickSingle('lightBrightnessKey', data.lightBrightnessKey)}
        />
      </details>

      <details className="cv2-details">
        <summary>{t('node.imageGenerator.camera')}</summary>
        <span className="cv2-field-label">{t('node.imageGenerator.shotSize')}</span>
        <ChipGroup
          options={shotSizeChoices}
          selected={data.shotSizeKey ? [String(data.shotSizeKey)] : []}
          single
          onToggle={pickSingle('shotSizeKey', data.shotSizeKey)}
        />
        <span className="cv2-field-label">{t('node.imageGenerator.cameraHeight')}</span>
        <ChipGroup
          options={cameraHeightChoices}
          selected={data.cameraHeightKey ? [String(data.cameraHeightKey)] : []}
          single
          onToggle={pickSingle('cameraHeightKey', data.cameraHeightKey)}
        />
      </details>

      <SnippetPicker selected={snippetIds} onToggle={toggle('snippetIds', snippetIds)} hideCamera />

      <UpstreamSummary nodeId={id} />
      <GeneratorStatus data={data} />
    </NodeShell>
  )
}

export function VideoGeneratorNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const { models, loading } = useMediaModels('video')
  const { run } = useRunner()
  const running = ['submitting', 'pending', 'processing'].includes(String(data.status ?? 'idle'))
  const snippetIds = (data.snippetIds as string[]) ?? []
  const model = models.find((item) => item.id === String(data.modelId ?? '')) ?? null
  const aspect = useAspectOptions(model?.provider, 'video')

  const toggleSnippet = (key: string) =>
    patch({ snippetIds: snippetIds.includes(key) ? snippetIds.filter((k) => k !== key) : [...snippetIds, key] })

  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.videoGenerator'))}
      selected={selected}
      width={340}
      actions={
        <button
          type="button"
          className="cv2-icon-button"
          disabled={running}
          title={running ? t('node.generator.running') : t('node.videoGenerator.run')}
          onClick={() => runNode(run, id, models)}
        >
          {running ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      }
    >
      <textarea
        className="cv2-textarea"
        rows={3}
        value={String(data.prompt ?? '')}
        placeholder={t('node.videoGenerator.placeholder')}
        onChange={(event) => patch({ prompt: event.target.value })}
      />

      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.generator.model')}</span>
        <select
          className="cv2-select"
          value={data.modelId ? String(data.modelId) : ''}
          onChange={(event) => patch({ modelId: event.target.value || null })}
        >
          <option value="">
            {loading
              ? t('node.generator.modelLoading')
              : models.length
                ? t('node.generator.modelPick')
                : t('node.generator.modelEmpty')}
          </option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.generator.ratio')}</span>
        {model ? (
          <ChipGroup
            options={aspect.options}
            selected={data.aspectRatio ? [String(data.aspectRatio)] : []}
            single
            onToggle={(key) => patch({ aspectRatio: key || null })}
          />
        ) : (
          <p className="cv2-hint">{t('node.generator.pickModelFirst')}</p>
        )}
      </div>

      <div className="cv2-field">
        <span className="cv2-field-label">
          {t('node.videoGenerator.duration', { seconds: String(data.durationSeconds ?? 5) })}
        </span>
        <input
          className="cv2-range"
          type="range"
          min={3}
          max={12}
          step={1}
          value={Number(data.durationSeconds ?? 5)}
          onChange={(event) => patch({ durationSeconds: Number(event.target.value) })}
        />
      </div>

      <OutputCountField
        provider={model?.provider}
        mode="video"
        value={Number(data.outputCount ?? 1)}
        onChange={(count) => patch({ outputCount: count })}
      />

      <SnippetPicker selected={snippetIds} onToggle={toggleSnippet} />

      <UpstreamSummary nodeId={id} />
      <GeneratorStatus data={data} />
    </NodeShell>
  )
}

export function AudioGeneratorNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  return (
    <NodeShell title={String(data.title ?? t('nodeKinds.audioGenerator'))} selected={selected} width={300}>
      <textarea
        className="cv2-textarea"
        rows={3}
        value={String(data.text ?? '')}
        placeholder={t('node.audioGenerator.placeholder')}
        onChange={(event) => patch({ text: event.target.value })}
      />
      <div className="cv2-field">
        <span className="cv2-field-label">{t('node.audioGenerator.voice')}</span>
        {/* 音色库要后端先有 TTS 渠道，现在只留位置 */}
        <select className="cv2-select" disabled>
          <option>{t('node.audioGenerator.voiceLoading')}</option>
        </select>
      </div>
      <p className="cv2-hint">{t('node.audioGenerator.blocked')}</p>
    </NodeShell>
  )
}
