
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ImageDropzone } from '@/components/ui/ImageDropzone'
import { AspectRatioSelect } from '@/components/ui/AspectRatioSelect'
import {
  Info,
  Lightbulb,
  Clock,
  Image as ImageIconSolid,
  ChevronDown,
  Wand2,
  FolderKanban,
  ArrowUp,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageTransition } from '@/components/shared/PageTransition'
import { useAuthStore } from '@/lib/store/authStore'
import { readRemixPayload } from '@/lib/utils/remix'
import { useStudioBodySkin } from '@/lib/hooks/useStudioBodySkin'
import { classifyFailure, isConfigurationFailure } from '@/lib/utils/failure'
import { cn } from '@/lib/utils/cn'
import { useTrackedTasks } from '@/lib/hooks/useTrackedTasks'
import { pickDefaultModelId } from '@/lib/utils/defaultModels'

import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { SimplifiedModelSelector } from './SimplifiedModelSelector'
import { ProjectContextPanel } from './ProjectContextPanel'
import { PromptOptimizePanel } from './PromptOptimizePanel'
import { VideoCreateWorkspace } from './VideoCreateWorkspace'
import { CreateStudioPanel, type StudioSummary } from './CreateStudioPanel'
import { IMAGE_SHOWCASE_CASES, VIDEO_SHOWCASE_CASES, type CreateShowcaseCase } from './showcaseCases'
import { VIDEO_MODEL_SAMPLES, findSampleModelId, type VideoModelSample } from '@/lib/prompts/videoModelSamples'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { RelayPriceNote } from '@/components/shared/RelayPriceNote'
import { useRelayPricing } from '@/lib/hooks/useRelayPricing'

import { describeAssetIssue, findAssetIssue, type AssetCheck } from './assetCompatibility'
import { CREATE_MODES, filterModelsByMode, pickModelForMode, type CreateMode } from './createModes'
import type { ProjectAsset, ProjectSummary } from '@/lib/api/types/projects'
import { modelService, imageService, videoService, projectsService, promptOptimizeService } from '@/lib/api/services'
import { useSearchParams } from '@/lib/router'
import Link from '@/lib/compat/link'
import { useLocale, useTranslations } from '@/i18n/client'
import type { Prompt } from '@/lib/types/prompt'
import { loadNetworkPrompts } from '@/lib/prompts/localPrompts'
import {
  getAspectRatioOptions,
  getImageSizeOptions,
  NANO_BANANA_IMAGE_SIZE_OPTIONS,
  getDoubaoVideoResolutionOptions,
  getDoubaoVideoRatioOptions,
  getDoubaoVideoDurationOptions,
  getWanxVideoResolutionOptions,
  getWanxVideoRatioOptions,
  createWanxVideoDurationOptions,
  MIDJOURNEY_BOT_TYPE_OPTIONS,
  MIDJOURNEY_VERSION_OPTIONS,
  MIDJOURNEY_QUALITY_OPTIONS,
  MIDJOURNEY_STYLE_OPTIONS,
  COMMON_ASPECT_RATIO_OPTIONS,
} from './config/aspectRatioOptions'

type CreationType = 'image' | 'video'
type MentionMediaKind = 'image' | 'video' | 'audio'
type MentionMediaSource = 'upload' | 'project'
type MentionableProjectAsset = ProjectAsset & { kind: Extract<ProjectAsset['kind'], MentionMediaKind> }

type MentionToken = {
  id: string
  kind: MentionMediaKind
  source: MentionMediaSource
  file: File | null
  assetId: string | null
}

type MentionableMediaItem = {
  kind: MentionMediaKind
  ordinal: number
  source: MentionMediaSource
  file: File | null
  asset: ProjectAsset | null
}

const MENTIONED_MEDIA_PROMPT_REGEX = /@(?=(?:图|图片|视频|音频)\d+)/g

function getMentionMediaTypeLabel(kind: MentionMediaKind) {
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  return '图'
}

function getMentionReferenceLabel(kind: MentionMediaKind, ordinal: number) {
  return `${getMentionMediaTypeLabel(kind)}${ordinal}`
}

function getMentionMediaBadge(kind: MentionMediaKind) {
  if (kind === 'video') return 'VID'
  if (kind === 'audio') return 'AUD'
  return 'IMG'
}

function getMentionMediaTone(kind: MentionMediaKind) {
  if (kind === 'video') {
    return 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200'
  }
  if (kind === 'audio') {
    return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200'
  }
  return 'border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200'
}

function createUploadMentionableMediaItems(
  files: File[],
  kind: MentionMediaKind
): Array<Omit<MentionableMediaItem, 'ordinal'>> {
  return files.map((file) => ({
    kind,
    source: 'upload',
    file,
    asset: null,
  }))
}

function isMentionableProjectAsset(asset: ProjectAsset): asset is MentionableProjectAsset {
  return asset.kind === 'image' || asset.kind === 'video'
}

function createProjectMentionableMediaItems(
  assets: ProjectAsset[]
): Array<Omit<MentionableMediaItem, 'ordinal'>> {
  return assets.filter(isMentionableProjectAsset).map((asset) => ({
    kind: asset.kind,
    source: 'project',
    file: null,
    asset,
  }))
}

function assignMentionOrdinals(
  items: Array<Omit<MentionableMediaItem, 'ordinal'>>
): MentionableMediaItem[] {
  return items.map((item, index) => ({
    ...item,
    ordinal: index + 1,
  }))
}

function doesMentionItemMatchToken(item: MentionableMediaItem, token: MentionToken) {
  if (item.kind !== token.kind || item.source !== token.source) return false
  if (item.source === 'project') return item.asset?.id === token.assetId
  return item.file === token.file
}

function getMentionMediaDisplayName(item: MentionableMediaItem) {
  if (item.source === 'project') {
    return item.asset?.title || item.asset?.fileName || `${getMentionMediaTypeLabel(item.kind)}素材`
  }

  return item.file?.name || `${getMentionMediaTypeLabel(item.kind)}素材`
}

function normalizePromptForRequest(rawPrompt: string) {
  return rawPrompt.replace(MENTIONED_MEDIA_PROMPT_REGEX, '')
}

function normalizeProviderFamily(providerValue?: string | null) {
  const normalized = (providerValue || '').toLowerCase().trim()
  if (normalized === 'qianwen') return 'qwen'
  if (normalized === 'mj') return 'midjourney'
  if (normalized === 'wanxiang') return 'wanx'
  return normalized
}

/** @提及 token 的 id。放模块级：它不是渲染期代码，写在组件体里会被 react-hooks/purity 当成渲染期调用 */
function nextMentionTokenId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function supportsQuickModeModel(model: ModelWithCapabilities) {
  if (typeof model.supportsQuickMode === 'boolean') {
    return model.supportsQuickMode
  }

  return model.type === 'image' || model.type === 'video'
}

function findPreferredVideoModelId<T extends { id: string; modelKey?: string | null; name?: string | null }>(
  models: T[],
  hint?: string | null,
) {
  const needles = [hint, 'seedance-2-5', 'seedance']
    .map((item) => item?.trim().toLowerCase())
    .filter((item): item is string => Boolean(item))

  for (const needle of needles) {
    const matched = models.find((model) => {
      const haystack = `${model.modelKey ?? ''} ${model.name ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
    if (matched) return matched.id
  }

  return models[0]?.id ?? ''
}

type WanxModelKind = 't2v' | 'i2v' | 'r2v'

type WanxMergedBundle = {
  generation: string
  t2v: ModelWithCapabilities
  i2v: ModelWithCapabilities
  r2v: ModelWithCapabilities
}

type CreateSelectableModel = ModelWithCapabilities & {
  wanxMergedBundle?: WanxMergedBundle
}

function resolveWanxModelName(model?: Pick<ModelWithCapabilities, 'modelKey' | 'capabilities'> | null) {
  return (model?.capabilities?.remoteModel || model?.modelKey || '').trim()
}

function resolveWanxGeneration(modelName?: string | null) {
  const normalized = String(modelName || '').trim().toLowerCase()
  if (normalized.startsWith('wan2.7')) return 'wan2.7'
  if (normalized.startsWith('happyhorse-1.0')) return 'happyhorse-1.0'
  return null
}

function resolveWanxModelKind(modelName?: string | null): WanxModelKind | null {
  const normalized = String(modelName || '').trim().toLowerCase()
  if (normalized.includes('-t2v')) return 't2v'
  if (normalized.includes('-i2v')) return 'i2v'
  if (normalized.includes('-r2v')) return 'r2v'
  return null
}

function buildCreateSelectableModels(
  sourceModels: ModelWithCapabilities[],
  activeTab: CreationType
): CreateSelectableModel[] {
  if (activeTab !== 'video') {
    return sourceModels
  }

  const wanxCandidates = new Map<string, Partial<Record<WanxModelKind, ModelWithCapabilities>>>()

  sourceModels.forEach((model) => {
    const provider = normalizeProviderFamily(model.provider)
    if (!provider.includes('wanx')) return

    const modelName = resolveWanxModelName(model)
    const generation = resolveWanxGeneration(modelName)
    const kind = resolveWanxModelKind(modelName)
    if (!generation || !kind) return

    const current = wanxCandidates.get(generation) ?? {}
    if (!current[kind]) {
      current[kind] = model
      wanxCandidates.set(generation, current)
    }
  })

  const mergedGenerations = new Set<string>()
  wanxCandidates.forEach((bundle, generation) => {
    if (bundle.t2v && bundle.i2v && bundle.r2v) {
      mergedGenerations.add(generation)
    }
  })

  const emittedGenerations = new Set<string>()
  const result: CreateSelectableModel[] = []

  sourceModels.forEach((model) => {
    const provider = normalizeProviderFamily(model.provider)
    const modelName = resolveWanxModelName(model)
    const generation = provider.includes('wanx') ? resolveWanxGeneration(modelName) : null
    const kind = provider.includes('wanx') ? resolveWanxModelKind(modelName) : null

    if (!generation || !kind || !mergedGenerations.has(generation)) {
      result.push(model)
      return
    }

    if (emittedGenerations.has(generation)) {
      return
    }

    const bundle = wanxCandidates.get(generation)
    if (!bundle?.t2v || !bundle?.i2v || !bundle?.r2v) {
      result.push(model)
      return
    }

    emittedGenerations.add(generation)
    result.push({
      ...bundle.r2v,
      wanxMergedBundle: {
        generation,
        t2v: bundle.t2v,
        i2v: bundle.i2v,
        r2v: bundle.r2v,
      },
    })
  })

  return result
}

function inferWanxMergedModelKind(input: {
  generation?: string | null
  hasReferenceImages: boolean
  hasReferenceVideos: boolean
  hasFirstFrame: boolean
  hasLastFrame: boolean
  hasContinuation: boolean
}): WanxModelKind {
  const isHappyhorse = input.generation === 'happyhorse-1.0'

  if (input.hasLastFrame || input.hasContinuation) {
    return 'i2v'
  }

  if (isHappyhorse && input.hasReferenceVideos) {
    return 'i2v'
  }

  if (input.hasReferenceImages || input.hasReferenceVideos) {
    return 'r2v'
  }

  if (input.hasFirstFrame) {
    return 'i2v'
  }

  return 't2v'
}

/** 灵感预设默认展示的张数，其余点「展开更多」 */
const QUICK_START_VISIBLE_COUNT = 8

const CREATE_BODY_EXTRA_CLASSES = ['create-page-no-edge-glow']

export function SimplifiedCreateContent() {
  const locale = useLocale()
  const t = useTranslations('create')
  const tFailure = useTranslations('errors.failure')
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  // 基础状态
  // 创作页整体围绕视频生成：媒体类型固定是 video，图片模型只在首尾帧模式的「生成这一帧」里用。
  // activeTab 保留下来是因为下面几十处视频逻辑都依赖它，改语义风险太大。
  const [activeTab, setActiveTab] = useState<CreationType>('video')
  /** 顶层模式：首尾帧创作 / 参考创作（照参考站 creative-studio） */
  const [createMode, setCreateMode] = useState<CreateMode>(() => {
    const requested = searchParams.get('mode')
    return requested === 'references' ? 'references' : 'frames'
  })
  const [models, setModels] = useState<CreateSelectableModel[]>([])
  // 配置渠道后用它触发模型列表重取
  const [modelsReloadToken, setModelsReloadToken] = useState(0)
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  // 创作页只保留完整版：简洁版的角色已由落地页（就地生成）承担。
  // 图片厂商一次只出一张，张数 = 并发提交的任务数
  const [imageCount, setImageCount] = useState(1)
  const resultsPanelRef = useRef<HTMLElement | null>(null)
  const { jobs: sessionJobs, addPlaceholders, resolveJob, failJobs, clearFinished } = useTrackedTasks(user?.id ?? null)
  const [loading, setLoading] = useState(false)

  // 网络提示词
  const [networkPrompts, setNetworkPrompts] = useState<Prompt[]>([])
  const [quickStartCategory, setQuickStartCategory] = useState('all')
  // loading 不再用单独的 state：effect 里同步 setXxxLoading(true) 会在每次请求一开始
  // 多触发一轮渲染。改成记「已经加载完的是哪一批」，loading = 还没加载到当前这批。
  const [quickStartLoadedFor, setQuickStartLoadedFor] = useState<string | null>(null)
  const [quickStartExpanded, setQuickStartExpanded] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([])
  const [projectAssetsLoadedFor, setProjectAssetsLoadedFor] = useState<string | null>(null)
  /** 派生的加载态：当前这批还没加载完就算加载中 */
  const quickStartLoading = quickStartLoadedFor !== activeTab
  const projectsLoading = !projectsLoaded
  const projectAssetsLoading = Boolean(selectedProjectId) && projectAssetsLoadedFor !== selectedProjectId
  const [selectedProjectAssetIds, setSelectedProjectAssetIds] = useState<string[]>([])

  // body 上的 dark + studio-skin：下拉、润色、项目素材这些弹层都 portal 到 body，跟着工作台变深色
  useStudioBodySkin(CREATE_BODY_EXTRA_CLASSES)

  // 创作参数
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const promptEditorRef = useRef<HTMLDivElement | null>(null)
  const promptTextareaRef = useRef<HTMLDivElement | null>(null)
  const mentionInsertRangeRef = useRef<Range | null>(null)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionTokens, setMentionTokens] = useState<MentionToken[]>([])
  const [mentionPreviewUrls, setMentionPreviewUrls] = useState<Array<string | null>>([])
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [inputImages, setInputImages] = useState<File[]>([])
  const [imageSize, setImageSize] = useState('2K') // Nano Banana 分辨率选项
  const [mjBotType, setMjBotType] = useState('MID_JOURNEY') // Midjourney bot 类型
  const [mjVersion, setMjVersion] = useState('') // Midjourney 版本 --v
  const [mjQuality, setMjQuality] = useState('') // Midjourney 质量 --q
  const [mjStylize, setMjStylize] = useState('') // Midjourney 风格化 --s (0-1000)
  const [mjChaos, setMjChaos] = useState('') // Midjourney 混乱度 --c (0-100)
  const [mjWeird, setMjWeird] = useState('') // Midjourney 怪异度 --weird (0-3000)
  const [mjStyle, setMjStyle] = useState('') // Midjourney 风格 --style raw
  const [mjSeed, setMjSeed] = useState('') // Midjourney 种子 --seed
  const [mjNo, setMjNo] = useState('') // Midjourney 排除 --no
  const [mjIw, setMjIw] = useState('') // Midjourney 图片权重 --iw
  const [mjTile, setMjTile] = useState(false) // Midjourney 平铺 --tile
  const [mjPersonalize, setMjPersonalize] = useState(false) // Midjourney 个性化 --p
  const [mjAdvancedOpen, setMjAdvancedOpen] = useState(false) // 更多参数面板展开状态

  // 视频特定参数
  const [videoDuration, setVideoDuration] = useState('5')
  const [videoResolution, setVideoResolution] = useState('720p')
  const [videoInputImages, setVideoInputImages] = useState<File[]>([]) // 视频参考图（通用：Sora/Runway/Luma等）
  const [doubaoReferenceImages, setDoubaoReferenceImages] = useState<File[]>([]) // 豆包参考图
  const [doubaoReferenceVideos, setDoubaoReferenceVideos] = useState<File[]>([]) // 豆包参考视频
  const [doubaoReferenceAudios, setDoubaoReferenceAudios] = useState<File[]>([]) // 豆包参考音频
  const [doubaoFrameImages, setDoubaoFrameImages] = useState<File[]>([]) // 豆包首尾帧（1-2张）
  const [wanxReferenceImages, setWanxReferenceImages] = useState<File[]>([])
  const [wanxReferenceVideos, setWanxReferenceVideos] = useState<File[]>([])
  const [wanxReferenceAudios, setWanxReferenceAudios] = useState<File[]>([])
  const [wanxFirstFrameImages, setWanxFirstFrameImages] = useState<File[]>([])
  const [wanxLastFrameImages, setWanxLastFrameImages] = useState<File[]>([])
  const [wanxVideoContinuationEnabled, setWanxVideoContinuationEnabled] = useState(false)
  const [doubaoGenerateAudio, setDoubaoGenerateAudio] = useState(true)

  // AI 提示词优化状态
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizedPrompts, setOptimizedPrompts] = useState<string[]>([])
  const [showOptimizeResult, setShowOptimizeResult] = useState(false)
  const [optimizeText, setoptimizeText] = useState('')
  const [includeImagesInOptimize, setIncludeImagesInOptimize] = useState(false)

  // 获取模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await modelService.getModelsWithCapabilities({ type: activeTab })
        const filtered = data.filter((m) => m.isActive && supportsQuickModeModel(m))
        // 两种模式吃的输入不同，能用的模型也不同：r2v 只在参考模式出现，可灵 / Sora 这些只在首尾帧模式
        setModels(buildCreateSelectableModels(filterModelsByMode(filtered, createMode), activeTab))
      } catch (error) {
        console.error('Failed to fetch models:', error)
        toast.error(t('errors.loadModels'))
      }
    }

    fetchModels()
  }, [activeTab, createMode, t, modelsReloadToken])

  useEffect(() => {
    if (models.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 模型列表变化后要挑一个能用的模型，这是列表和选中项的联动
      setSelectedModelId('')
      return
    }

    if (!models.some((model) => model.id === selectedModelId)) {
      // 默认：图片 GPT Image 2、视频 Seedance 2.5；没配就用列表第一个
      setSelectedModelId(pickDefaultModelId(models, activeTab))
      return
    }
    // 切模式后原来选的模型可能不支持新模式，换成该模式下第一个能用的
    const usableId = pickModelForMode(models, createMode, selectedModelId)
    if (usableId && usableId !== selectedModelId) setSelectedModelId(usableId)
  }, [activeTab, createMode, models, selectedModelId])

  // 富文本编辑器的内容一直是命令式写入的，挂载时不会自己读 prompt。
  // 从链接带进来的提示词（落地页「高级版」、样本、做同款）要手动灌一次，否则编辑器是空的。
  useEffect(() => {
    const editor = promptTextareaRef.current
    if (!editor || editor.textContent || !prompt) return
    editor.textContent = prompt
  }, [prompt])

  const appliedRemixTaskIdRef = useRef<string | null>(null)

  // 「做同款」回填：模型要等模型列表就绪才能落位。
  // 画面参数只在原模型仍可用时套用 —— 换了模型，旧的档位未必是合法选项。
  useEffect(() => {
    const remix = readRemixPayload(searchParams)
    if (!remix.fromTaskId || models.length === 0) return
    if (appliedRemixTaskIdRef.current === remix.fromTaskId) return
    appliedRemixTaskIdRef.current = remix.fromTaskId

    if (!remix.modelId) return

    const matched = models.find((model) => model.id === remix.modelId)
    if (!matched) {
      toast.warning(t('remix.modelMissing'))
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 「做同款」带的参数只回填一次（ref 防重复），是一次性初始化
    setSelectedModelId(matched.id)
    if (remix.aspectRatio) setAspectRatio(remix.aspectRatio)
    if (remix.imageSize) setImageSize(remix.imageSize)
    if (remix.videoDuration) setVideoDuration(remix.videoDuration)
    if (remix.videoResolution) setVideoResolution(remix.videoResolution)
    toast.success(t('remix.applied'))
  }, [models, searchParams, t])

  // 加载网络提示词：图片用 banana 模板，视频用 Seedance 格式模板
  useEffect(() => {
    let cancelled = false

    loadNetworkPrompts(activeTab)
      .then((prompts) => {
        if (cancelled) return
        setNetworkPrompts(prompts)
      })
      .catch(() => {
        if (cancelled) return
        setNetworkPrompts([])
      })
      .finally(() => {
        if (!cancelled) setQuickStartLoadedFor(activeTab)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab])

  useEffect(() => {
    let cancelled = false

    projectsService.getProjects()
      .then((data) => {
        if (cancelled) return
        setProjects(data)
        setSelectedProjectId((current) => {
          if (current && data.some((project) => project.id === current)) return current
          return ''
        })
      })
      .catch((error) => {
        console.error('Failed to load projects:', error)
        if (cancelled) return
        setProjects([])
        setSelectedProjectId('')
      })
      .finally(() => {
        if (!cancelled) setProjectsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 切项目就是要换一批素材，不是丢用户的东西
      setProjectAssets([])
      setSelectedProjectAssetIds([])
      return
    }

    let cancelled = false

    projectsService.getProjectAssets(selectedProjectId)
      .then((data) => {
        if (cancelled) return
        setProjectAssets(data)
      })
      .catch((error) => {
        console.error('Failed to load project assets:', error)
        if (cancelled) return
        setProjectAssets([])
      })
      .finally(() => {
        if (!cancelled) setProjectAssetsLoadedFor(selectedProjectId)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProjectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 素材重新加载后，剔掉已经不存在的勾选
    setSelectedProjectAssetIds((prev) =>
      prev.filter((assetId) => projectAssets.some((asset) => asset.id === assetId))
    )
  }, [projectAssets])


  const applyNetworkPrompt = (item: Prompt) => {
    if (activeTab === 'video') {
      const modelId = findPreferredVideoModelId(models, item.sub_category || item.author)
      if (modelId) setSelectedModelId(modelId)
    }
    setPrompt(item.prompt)
    setShowOptimizeResult(false)
    setOptimizedPrompts([])
    const editor = promptTextareaRef.current
    if (editor) {
      editor.textContent = item.prompt
    }
    toast.success(`${t('featuredTemplates.applyTemplate')}: ${item.title}`)
  }

  const appliedSampleIdRef = useRef<string | null>(null)

  useEffect(() => {
    const remix = readRemixPayload(searchParams)

    // 创作页现在是纯视频：做同款带过来的如果是图片任务，只接提示词，不切回图片表单
    // （那个表单已经没有标签页能切回来了，图片能力走首尾帧模式里的「生成这一帧」）
    if (remix.mode === 'video') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 带的 remix 参数只回填一次
      setActiveTab('video')
    }

    if (remix.prompt) {
      setPrompt(remix.prompt)
    }

    if (remix.negativePrompt) {
      setNegativePrompt(remix.negativePrompt)
    }
  }, [searchParams])

  // 获取当前选中的模型
  const priceFor = useRelayPricing()
  const selectedModel = useMemo<CreateSelectableModel | null>(() => {
    return models.find((m) => m.id === selectedModelId) ?? null
  }, [models, selectedModelId])
  const selectedProject = useMemo<ProjectSummary | null>(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [projects, selectedProjectId])
  const supportsImageInput = Boolean(selectedModel?.capabilities?.supports?.imageInput)
  const supportsResolutionSelect = Boolean(selectedModel?.capabilities?.supports?.resolutionSelect)
  const supportsSizeSelect = Boolean(selectedModel?.capabilities?.supports?.sizeSelect)
  const maxInputImages = selectedModel?.capabilities?.limits?.maxInputImages || 1

  const hasSelectedProjectImageAssets = useMemo(
    () => projectAssets.some((asset) => asset.kind === 'image' && selectedProjectAssetIds.includes(asset.id)),
    [projectAssets, selectedProjectAssetIds]
  )

  // 智能判断创作模式
  const creationMode = useMemo(() => {
    if (activeTab === 'image' && (inputImages.length > 0 || hasSelectedProjectImageAssets) && supportsImageInput) {
      return 'image-to-image'
    }
    return 'text-to-image'
  }, [activeTab, inputImages.length, hasSelectedProjectImageAssets, supportsImageInput])

  // 获取当前模型支持的尺寸选项
  const aspectRatioOptions = useMemo(() => {
    return getAspectRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 获取当前模型支持的分辨率选项
  // 对 nanobanana/gemini：若管理员开启分辨率开关，即使非 Pro 也显示标准分辨率选项
  const imageSizeOptions = useMemo(() => {
    const result = getImageSizeOptions(selectedModel?.provider)
    if (result) return result

    // 如果 provider 匹配失败，尝试用 remoteModel 匹配（如 gemini-3-pro-image）
    const remoteModel = selectedModel?.capabilities?.remoteModel
    if (remoteModel) {
      return getImageSizeOptions(remoteModel)
    }

    const provider = selectedModel?.provider?.toLowerCase() || ''
    const isNanoBananaFamily = provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')
    if (isNanoBananaFamily && supportsResolutionSelect) {
      return NANO_BANANA_IMAGE_SIZE_OPTIONS
    }

    return null
  }, [selectedModel, supportsResolutionSelect])

  // 获取豆包视频分辨率选项
  const doubaoVideoResolutionOptions = useMemo(() => {
    return getDoubaoVideoResolutionOptions(selectedModel?.provider, selectedModel?.capabilities?.remoteModel)
  }, [selectedModel])

  // 获取豆包视频宽高比选项
  const doubaoVideoRatioOptions = useMemo(() => {
    return getDoubaoVideoRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 获取豆包视频时长选项
  const doubaoVideoDurationOptions = useMemo(() => {
    return getDoubaoVideoDurationOptions(selectedModel?.provider, selectedModel?.capabilities?.remoteModel)
  }, [selectedModel])

  const wanxVideoResolutionOptions = useMemo(() => {
    return getWanxVideoResolutionOptions(selectedModel?.provider)
  }, [selectedModel])

  const wanxVideoRatioOptions = useMemo(() => {
    return getWanxVideoRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 判断是否是 Nano Banana Pro（支持 2K/4K 分辨率选项）
  // 同时检查 provider、modelKey 和 remoteModel，因为 provider 可能只是 "nanobanana"
  // 而 remoteModel 才包含完整模型名如 "gemini-3-pro-image"
  const isNanoBananaPro = useMemo(() => {
    const provider = selectedModel?.provider?.toLowerCase() || ''
    const remoteModel = selectedModel?.capabilities?.remoteModel?.toLowerCase() || ''
    const modelKey = selectedModel?.modelKey?.toLowerCase() || ''

    // 合并所有标识进行检测
    const combined = `${provider} ${remoteModel} ${modelKey}`

    return combined.includes('nanobananapro') ||
           combined.includes('nano_banana_pro') ||
           combined.includes('nano-banana-pro') ||
           (combined.includes('gemini') && combined.includes('pro'))
  }, [selectedModel])

  // 判断是否是普通 Nano Banana（不包含 Pro 版本）
  const isNanoBanana = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    const isNanoBananaFamily = provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')
    return isNanoBananaFamily && !isNanoBananaPro
  }, [selectedModel, isNanoBananaPro])

  // 判断是否是豆包（只需要分辨率）
  const isDoubao = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('doubao') || provider?.includes('bytedance') || provider?.includes('ark')
  }, [selectedModel])

  // 判断是否是 Qwen / 通义千问（固定像素尺寸，支持多图输入）
  const isQwenImage = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider.includes('qwen') || provider.includes('qianwen')
  }, [selectedModel])

  // 判断是否是 GPT Image（固定像素尺寸）
  const isGptImage = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('gpt') || provider?.includes('openai')
  }, [selectedModel])

  // 判断是否是豆包视频（支持首尾帧和完整参数控制）
  const isDoubaoVideo = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return activeTab === 'video' && (provider?.includes('doubao') || provider?.includes('bytedance') || provider?.includes('ark'))
  }, [selectedModel, activeTab])

  const isDoubaoSeedance20 = useMemo(() => {
    const remoteModel = selectedModel?.capabilities?.remoteModel?.toLowerCase() || ''
    return isDoubaoVideo && remoteModel.includes('seedance-2-0')
  }, [selectedModel, isDoubaoVideo])

  const isWanxVideo = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return activeTab === 'video' && provider.includes('wanx')
  }, [selectedModel, activeTab])

  const isWanx27Video = useMemo(() => {
    return isWanxVideo && resolveWanxGeneration(resolveWanxModelName(selectedModel)) === 'wan2.7'
  }, [selectedModel, isWanxVideo])

  const isWanxMergedVideo = useMemo(
    () => Boolean(selectedModel?.wanxMergedBundle),
    [selectedModel]
  )

  const wanxSelectedGeneration = useMemo(() => {
    if (!isWanxVideo) return null
    return selectedModel?.wanxMergedBundle?.generation ?? resolveWanxGeneration(resolveWanxModelName(selectedModel))
  }, [isWanxVideo, selectedModel])

  const isWanxHappyhorseVideo = useMemo(
    () => wanxSelectedGeneration === 'happyhorse-1.0',
    [wanxSelectedGeneration]
  )

  const wanxBaseModelKind = useMemo(() => {
    if (!isWanxVideo || isWanxMergedVideo) return null
    return resolveWanxModelKind(resolveWanxModelName(selectedModel))
  }, [isWanxMergedVideo, isWanxVideo, selectedModel])

  const wanxCanSelectVideoAssets = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return true
    if (wanxSelectedGeneration === 'happyhorse-1.0') {
      return isWanxMergedVideo || wanxBaseModelKind === 'i2v'
    }
    return false
  }, [isWanxMergedVideo, isWanxVideo, wanxBaseModelKind, wanxSelectedGeneration])

  // 判断是否是 Midjourney（不需要额外参数）
  const isMidjourney = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('midjourney') || provider?.includes('mj')
  }, [selectedModel])

  const usableProjectAssets = useMemo(() => {
    if (!supportsImageInput || !selectedProject) return []

    if (activeTab === 'image') {
      return projectAssets.filter((asset) => asset.kind === 'image')
    }

    if (isDoubaoVideo && isDoubaoSeedance20) {
      return projectAssets.filter((asset) => asset.kind === 'image' || asset.kind === 'video')
    }

    if (isWanxVideo) {
      return projectAssets.filter((asset) => asset.kind === 'image' || (wanxCanSelectVideoAssets && asset.kind === 'video'))
    }

    return projectAssets.filter((asset) => asset.kind === 'image')
  }, [activeTab, isDoubaoSeedance20, isDoubaoVideo, isWanxVideo, projectAssets, selectedProject, supportsImageInput, wanxCanSelectVideoAssets])

  const selectedProjectAssets = useMemo(() => {
    const usableAssetMap = new Map<string, ProjectAsset>(
      usableProjectAssets.map((asset) => [asset.id, asset] as const)
    )
    return selectedProjectAssetIds
      .map((assetId) => usableAssetMap.get(assetId) ?? null)
      .filter((asset): asset is ProjectAsset => Boolean(asset))
  }, [selectedProjectAssetIds, usableProjectAssets])

  const selectedProjectImageAssets = useMemo(() => {
    return selectedProjectAssets.filter((asset) => asset.kind === 'image')
  }, [selectedProjectAssets])

  const selectedProjectVideoAssets = useMemo(() => {
    return selectedProjectAssets.filter((asset) => asset.kind === 'video')
  }, [selectedProjectAssets])

  const selectedUsableProjectAssetCount = useMemo(
    () => selectedProjectAssets.length,
    [selectedProjectAssets]
  )

  const wanxReferenceVisualUploadCount = useMemo(
    () => wanxReferenceImages.length + wanxReferenceVideos.length,
    [wanxReferenceImages.length, wanxReferenceVideos.length]
  )

  const wanxProjectReferenceVisualCount = useMemo(
    () => selectedProjectImageAssets.length + selectedProjectVideoAssets.length,
    [selectedProjectImageAssets.length, selectedProjectVideoAssets.length]
  )

  const wanxTotalReferenceVisualCount = useMemo(
    () => wanxReferenceVisualUploadCount + wanxProjectReferenceVisualCount,
    [wanxProjectReferenceVisualCount, wanxReferenceVisualUploadCount]
  )

  const wanxHasReferenceImageInputs = useMemo(
    () => wanxReferenceImages.length > 0 || selectedProjectImageAssets.length > 0,
    [wanxReferenceImages.length, selectedProjectImageAssets.length]
  )

  const wanxHasReferenceVideoInputs = useMemo(
    () => wanxReferenceVideos.length > 0 || selectedProjectVideoAssets.length > 0,
    [wanxReferenceVideos.length, selectedProjectVideoAssets.length]
  )

  const wanxResolvedModelKind = useMemo<WanxModelKind | null>(() => {
    if (!isWanxVideo) return null

    if (!isWanxMergedVideo) {
      return wanxBaseModelKind
    }

    return inferWanxMergedModelKind({
      generation: wanxSelectedGeneration,
      hasReferenceImages: wanxHasReferenceImageInputs,
      hasReferenceVideos: wanxHasReferenceVideoInputs,
      hasFirstFrame: wanxFirstFrameImages.length > 0,
      hasLastFrame: wanxLastFrameImages.length > 0,
      hasContinuation: wanxVideoContinuationEnabled,
    })
  }, [
    isWanxVideo,
    isWanxMergedVideo,
    wanxBaseModelKind,
    wanxHasReferenceImageInputs,
    wanxHasReferenceVideoInputs,
    wanxFirstFrameImages.length,
    wanxLastFrameImages.length,
    wanxSelectedGeneration,
    wanxVideoContinuationEnabled,
  ])

  const wanxSupportsAudioInput = useMemo(
    () => isWanx27Video || (isWanxHappyhorseVideo && wanxResolvedModelKind === 't2v'),
    [isWanx27Video, isWanxHappyhorseVideo, wanxResolvedModelKind]
  )

  const wanxSupportsFirstFrameInput = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return supportsImageInput || isWanxMergedVideo
    if (wanxSelectedGeneration === 'happyhorse-1.0') return isWanxMergedVideo || wanxResolvedModelKind === 'i2v'
    return false
  }, [isWanxMergedVideo, isWanxVideo, supportsImageInput, wanxResolvedModelKind, wanxSelectedGeneration])

  const wanxSupportsLastFrameInput = useMemo(
    () => isWanxVideo && wanxSelectedGeneration === 'wan2.7',
    [isWanxVideo, wanxSelectedGeneration]
  )

  const wanxAllowsReferenceVideoInputs = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return true
    if (wanxSelectedGeneration === 'happyhorse-1.0') {
      return isWanxMergedVideo || wanxResolvedModelKind === 'i2v'
    }
    return false
  }, [isWanxMergedVideo, isWanxVideo, wanxResolvedModelKind, wanxSelectedGeneration])

  const wanxCanCustomizeRatio = useMemo(
    () => isWanxVideo && wanxResolvedModelKind !== 'i2v' && wanxFirstFrameImages.length === 0,
    [isWanxVideo, wanxResolvedModelKind, wanxFirstFrameImages.length]
  )

  const wanxReferenceAudioUploadMaxFiles = useMemo(() => {
    if (!wanxSupportsAudioInput) return 0
    if (wanxResolvedModelKind === 'r2v') {
      return Math.min(5, Math.max(0, wanxTotalReferenceVisualCount))
    }
    return 1
  }, [wanxResolvedModelKind, wanxSupportsAudioInput, wanxTotalReferenceVisualCount])

  const selectedExecutionModel = useMemo<ModelWithCapabilities | null>(() => {
    if (!selectedModel) return null
    if (!selectedModel.wanxMergedBundle || !wanxResolvedModelKind) {
      return selectedModel
    }
    return selectedModel.wanxMergedBundle[wanxResolvedModelKind]
  }, [selectedModel, wanxResolvedModelKind])

  const imageReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, maxInputImages - selectedProjectImageAssets.length),
    [maxInputImages, selectedProjectImageAssets.length]
  )

  const standardVideoReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, maxInputImages - selectedProjectImageAssets.length),
    [maxInputImages, selectedProjectImageAssets.length]
  )

  const doubaoReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, 4 - selectedProjectImageAssets.length),
    [selectedProjectImageAssets.length]
  )

  const seedanceReferenceImageUploadMaxFiles = useMemo(
    () => Math.max(0, 9 - selectedProjectImageAssets.length),
    [selectedProjectImageAssets.length]
  )

  const seedanceReferenceVideoUploadMaxFiles = useMemo(
    () => Math.max(0, 3 - selectedProjectVideoAssets.length),
    [selectedProjectVideoAssets.length]
  )

  const wanxReferenceImageUploadMaxFiles = useMemo(
    () => Math.max(0, 5 - wanxProjectReferenceVisualCount - wanxReferenceVideos.length),
    [wanxProjectReferenceVisualCount, wanxReferenceVideos.length]
  )

  const wanxReferenceVideoUploadMaxFiles = useMemo(
    () => {
      if (!wanxAllowsReferenceVideoInputs) return 0
      if (isWanxHappyhorseVideo) {
        return Math.max(0, 1 - selectedProjectVideoAssets.length)
      }
      return Math.max(0, 5 - wanxProjectReferenceVisualCount - wanxReferenceImages.length)
    },
    [
      isWanxHappyhorseVideo,
      selectedProjectVideoAssets.length,
      wanxAllowsReferenceVideoInputs,
      wanxProjectReferenceVisualCount,
      wanxReferenceImages.length,
    ]
  )

  const wanxVideoDurationOptions = useMemo(() => {
    if (!isWanxVideo) return null
    return createWanxVideoDurationOptions({
      hasReferenceVideo: wanxResolvedModelKind === 'r2v' && wanxHasReferenceVideoInputs,
      generation: wanxSelectedGeneration,
    })
  }, [isWanxVideo, wanxHasReferenceVideoInputs, wanxResolvedModelKind, wanxSelectedGeneration])

  const hasDoubaoSeedance20ReferenceInputs = useMemo(
    () =>
      doubaoReferenceImages.length > 0 ||
      doubaoReferenceVideos.length > 0 ||
      doubaoReferenceAudios.length > 0 ||
      selectedProjectImageAssets.length > 0 ||
      selectedProjectVideoAssets.length > 0,
    [
      doubaoReferenceImages,
      doubaoReferenceVideos,
      doubaoReferenceAudios,
      selectedProjectImageAssets.length,
      selectedProjectVideoAssets.length,
    ]
  )

  const hasDoubaoSeedance20FrameInputs = useMemo(
    () => doubaoFrameImages.length > 0,
    [doubaoFrameImages]
  )

  // 依赖列在函数自己身上，而不是抄一份到下面 useMemo 的依赖数组里——
  // 抄一份的话，以后改这个函数很容易忘了同步，判断就会用上过期的值。
  const canAddProjectAsset = useCallback((asset: ProjectAsset) => {
    if (!supportsImageInput) return false

    if (activeTab === 'image') {
      return asset.kind === 'image' && inputImages.length + selectedProjectImageAssets.length < maxInputImages
    }

    if (isDoubaoVideo) {
      if (doubaoFrameImages.length > 0) return false

      if (isDoubaoSeedance20) {
        if (asset.kind === 'image') {
          return doubaoReferenceImages.length + selectedProjectImageAssets.length < 9
        }
        if (asset.kind === 'video') {
          return doubaoReferenceVideos.length + selectedProjectVideoAssets.length < 3
        }
        return false
      }

      return asset.kind === 'image' && doubaoReferenceImages.length + selectedProjectImageAssets.length < 4
    }

    if (isWanxVideo) {
      if (asset.kind === 'video' && !wanxAllowsReferenceVideoInputs) {
        return false
      }

      if (wanxResolvedModelKind === 'i2v') {
        if (asset.kind === 'image') {
          return selectedProjectImageAssets.length < 1 && wanxReferenceImages.length === 0 && wanxFirstFrameImages.length === 0
        }
        if (asset.kind === 'video') {
          return selectedProjectVideoAssets.length < 1 && wanxReferenceVideos.length === 0
        }
        return false
      }

      if (isWanxHappyhorseVideo && asset.kind === 'video') {
        return selectedProjectVideoAssets.length < 1 && wanxReferenceVideos.length === 0
      }

      if (asset.kind !== 'image' && asset.kind !== 'video') return false
      return (
        wanxReferenceImages.length +
          wanxReferenceVideos.length +
          selectedProjectImageAssets.length +
          selectedProjectVideoAssets.length <
        5
      )
    }

    return asset.kind === 'image' && videoInputImages.length + selectedProjectImageAssets.length < maxInputImages
  }, [
    activeTab,
    inputImages.length,
    videoInputImages.length,
    doubaoReferenceImages.length,
    doubaoReferenceVideos.length,
    doubaoFrameImages.length,
    selectedProjectImageAssets.length,
    selectedProjectVideoAssets.length,
    supportsImageInput,
    isDoubaoVideo,
    isDoubaoSeedance20,
    isWanxVideo,
    isWanxHappyhorseVideo,
    wanxResolvedModelKind,
    wanxAllowsReferenceVideoInputs,
    maxInputImages,
    wanxReferenceImages.length,
    wanxReferenceVideos.length,
    wanxFirstFrameImages.length,
  ])

  const disabledProjectAssetIds = useMemo(() => {
    return usableProjectAssets
      .filter((asset) => !selectedProjectAssetIds.includes(asset.id) && !canAddProjectAsset(asset))
      .map((asset) => asset.id)
  }, [usableProjectAssets, selectedProjectAssetIds, canAddProjectAsset])

  const handleToggleProjectAsset = (assetId: string) => {
    const asset = usableProjectAssets.find((item) => item.id === assetId)
    if (!asset) return

    if (selectedProjectAssetIds.includes(assetId)) {
      setSelectedProjectAssetIds((prev) => prev.filter((id) => id !== assetId))
      return
    }

    if (!canAddProjectAsset(asset)) {
      if (isDoubaoVideo && doubaoFrameImages.length > 0) {
        toast.error(isDoubaoSeedance20 ? t('errors.doubaoModesExclusive') : t('errors.referenceAssetsMutuallyExclusive'))
        return
      }

      const max =
        activeTab === 'image'
          ? maxInputImages
          : isDoubaoVideo
            ? isDoubaoSeedance20
              ? asset.kind === 'video' ? 3 : 9
              : 4
            : isWanxVideo
              ? wanxResolvedModelKind === 'i2v' || (isWanxHappyhorseVideo && asset.kind === 'video') ? 1 : 5
              : maxInputImages

      toast.error(t('errors.referenceLimitReached', { max }))
      return
    }

    setSelectedProjectAssetIds((prev) => [...prev, assetId])
  }

  // 提示词 @ 引用可选的素材（按当前创作模式选择有效集合）
  const mentionableMedia = useMemo(() => {
    if (!supportsImageInput) return []

    if (activeTab === 'image') {
      return assignMentionOrdinals([
        ...createUploadMentionableMediaItems(inputImages, 'image'),
        ...createProjectMentionableMediaItems(selectedProjectImageAssets),
      ])
    }

    if (isDoubaoVideo) {
      if (isDoubaoSeedance20) {
        if (doubaoFrameImages.length > 0) {
          return assignMentionOrdinals(createUploadMentionableMediaItems(doubaoFrameImages, 'image'))
        }

        return assignMentionOrdinals([
          ...createUploadMentionableMediaItems(doubaoReferenceImages, 'image'),
          ...createUploadMentionableMediaItems(doubaoReferenceVideos, 'video'),
          ...createUploadMentionableMediaItems(doubaoReferenceAudios, 'audio'),
          ...createProjectMentionableMediaItems(selectedProjectAssets),
        ])
      }

      if (doubaoReferenceImages.length > 0 || selectedProjectImageAssets.length > 0) {
        return assignMentionOrdinals([
          ...createUploadMentionableMediaItems(doubaoReferenceImages, 'image'),
          ...createProjectMentionableMediaItems(selectedProjectImageAssets),
        ])
      }
      if (doubaoFrameImages.length > 0) {
        return assignMentionOrdinals(createUploadMentionableMediaItems(doubaoFrameImages, 'image'))
      }
      return []
    }

    if (isWanxVideo) {
      return assignMentionOrdinals([
        ...createUploadMentionableMediaItems(wanxReferenceImages, 'image'),
        ...(wanxAllowsReferenceVideoInputs ? createUploadMentionableMediaItems(wanxReferenceVideos, 'video') : []),
        ...createProjectMentionableMediaItems(
          selectedProjectAssets.filter((asset) => asset.kind === 'image' || (wanxAllowsReferenceVideoInputs && asset.kind === 'video'))
        ),
      ])
    }

    return assignMentionOrdinals([
      ...createUploadMentionableMediaItems(videoInputImages, 'image'),
      ...createProjectMentionableMediaItems(selectedProjectImageAssets),
    ])
  }, [
    activeTab,
    inputImages,
    videoInputImages,
    doubaoReferenceImages,
    doubaoReferenceVideos,
    doubaoReferenceAudios,
    doubaoFrameImages,
    wanxReferenceImages,
    wanxReferenceVideos,
    selectedProjectAssets,
    selectedProjectImageAssets,
    isDoubaoVideo,
    isDoubaoSeedance20,
    isWanxVideo,
    wanxAllowsReferenceVideoInputs,
    supportsImageInput,
  ])





  // 只剔掉「素材已经不在了」的勾选（项目里删掉了 / 不在当前筛选范围）。
  // **不**按模型限制剔：换模型不该把用户勾的素材悄悄取消，
  // 超出限制留到点生成时报错（见 findAssetIssue）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只剔掉已不存在的素材勾选，见上方注释
    setSelectedProjectAssetIds((prev) => {
      const existingIds = new Set(usableProjectAssets.map((asset) => asset.id))
      const next = prev.filter((assetId) => existingIds.has(assetId))
      return next.length === prev.length ? prev : next
    })
  }, [usableProjectAssets])




  // 为 @ 引用弹层生成本地预览图（图片展示缩略图，视频/音频展示类型徽标）
  useEffect(() => {
    const urls = mentionableMedia.map((item) => {
      if (item.kind !== 'image') return null
      if (item.source === 'project') {
        return item.asset?.thumbnailUrl || item.asset?.url || null
      }
      if (!item.file) return null
      return URL.createObjectURL(item.file)
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 为 @ 弹层生成预览图 objectURL，并在清理函数里回收，必须是 effect
    setMentionPreviewUrls(urls)
    return () => {
      urls.forEach((url, index) => {
        if (url && mentionableMedia[index]?.source === 'upload') {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [mentionableMedia])

  // 没有可引用素材时，自动关闭 @ 选择弹层
  useEffect(() => {
    if (mentionableMedia.length > 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 没有可引用素材时关掉弹层，纯 UI 联动
    setShowMentionPicker(false)
  }, [mentionableMedia.length])

  // 如果上传素材变化导致某些 @ 引用不存在，自动移除对应引用
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 素材被删后必须剔掉指向它的 @ 引用，否则提示词里留悬空引用
    setMentionTokens((prev) =>
      prev.filter((token) =>
        mentionableMedia.some((item) => doesMentionItemMatchToken(item, token))
      )
    )
  }, [mentionableMedia])

  // 点击外部关闭 @ 选择弹层
  useEffect(() => {
    if (!showMentionPicker) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (promptEditorRef.current?.contains(target)) return
      setShowMentionPicker(false)
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setShowMentionPicker(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMentionPicker])

  // 这几个编辑器读写函数放在下面几个 effect 之前：
  // 它们本来声明在更后面，effect 里「先用后声明」靠的是 effect 在渲染后才跑，
  // 能work但很脆，react-hooks/immutability 也会报错。依赖的 mentionableMedia / mentionTokens 都在更前面。
  const getMentionReferenceByTokenId = useCallback((tokenId: string) => {
    const token = mentionTokens.find((item) => item.id === tokenId)
    if (!token) return null
    const mediaIndex = mentionableMedia.findIndex((item) => doesMentionItemMatchToken(item, token))
    if (mediaIndex < 0) return null
    const media = mentionableMedia[mediaIndex]
    return {
      mediaIndex,
      kind: media.kind,
      ordinal: media.ordinal,
      label: getMentionReferenceLabel(media.kind, media.ordinal),
    }
  }, [mentionTokens, mentionableMedia])

  /**
   * 读编辑器里的纯文本。编辑器还没挂载时返回 null（而不是回退到 prompt）——
   * 回退的话这个函数就依赖 prompt，每次输入都换一个新函数，
   * 放进 effect 依赖数组会让 effect 跟着 prompt 反复触发。
   */
  const readPlainPromptFromEditor = useCallback(() => {
    const editor = promptTextareaRef.current
    if (!editor) return null

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const element = node as HTMLElement
      if (element.dataset.mentionId) return ''
      if (element.tagName === 'BR') return '\n'

      const content = (Array.from(element.childNodes) as Node[]).map((child) => walk(child)).join('')
      if (element.tagName === 'DIV' || element.tagName === 'P') return `${content}\n`
      return content
    }

    return (Array.from(editor.childNodes) as Node[])
      .map((node) => walk(node))
      .join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }, [])

  const syncMentionTokensWithEditor = () => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const idsInEditor = new Set(
      Array.from(editor.querySelectorAll<HTMLElement>('[data-mention-id]'))
        .map((node) => node.dataset.mentionId)
        .filter((id): id is string => Boolean(id))
    )

    setMentionTokens((prev) => prev.filter((token) => idsInEditor.has(token.id)))
  }

  const syncPromptWithEditor = useCallback(() => {
    const text = readPlainPromptFromEditor()
    if (text !== null) setPrompt(text)
  }, [readPlainPromptFromEditor])

  // 外部设置提示词（网络提示词、优化结果）时同步到编辑器，并清空旧的图片引用
  useEffect(() => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const currentPlainText = readPlainPromptFromEditor()
    if (currentPlainText === prompt) return

    editor.innerHTML = ''
    if (prompt) {
      editor.appendChild(document.createTextNode(prompt))
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部改了提示词（网络提示词/润色结果）要同步进编辑器 DOM
    setMentionTokens([])
  }, [prompt, readPlainPromptFromEditor])

  // 上传素材顺序变化后，刷新行内引用文案与缩略图
  useEffect(() => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const removedTokenIds: string[] = []
    for (const token of mentionTokens) {
      const mentionNode = editor.querySelector<HTMLElement>(`[data-mention-id="${token.id}"]`)
      if (!mentionNode) continue

      const mentionReference = getMentionReferenceByTokenId(token.id)
      if (!mentionReference) {
        mentionNode.remove()
        removedTokenIds.push(token.id)
        continue
      }

      const labelNode = mentionNode.querySelector<HTMLElement>('[data-mention-label]')
      if (labelNode) {
        labelNode.textContent = mentionReference.label
      }

      const thumbNode = mentionNode.querySelector<HTMLImageElement>('[data-mention-thumb]')
      const previewUrl = mentionPreviewUrls[mentionReference.mediaIndex]
      if (thumbNode && previewUrl) {
        thumbNode.src = previewUrl
      }
    }

    if (removedTokenIds.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 素材顺序变了要刷新行内引用的文案和缩略图
      setMentionTokens((prev) => prev.filter((token) => !removedTokenIds.includes(token.id)))
      syncPromptWithEditor()
    }
  }, [mentionTokens, mentionableMedia, mentionPreviewUrls, getMentionReferenceByTokenId, syncPromptWithEditor])

  // 当切换模型时，重置尺寸选项为第一个
  useEffect(() => {
    if (aspectRatioOptions.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 换模型重置为新模型默认画幅——产品行为，用户 2026-09-23 确认保留
      setAspectRatio(aspectRatioOptions[0].value)
    }
  }, [aspectRatioOptions])

  // 当切换到豆包视频模型时，重置参数为默认值
  useEffect(() => {
    if (isDoubaoVideo && doubaoVideoResolutionOptions && doubaoVideoRatioOptions && doubaoVideoDurationOptions) {
      const defaultResolution = doubaoVideoResolutionOptions.find((option) => option.value === '720p') ?? doubaoVideoResolutionOptions[0]
      const defaultRatio = doubaoVideoRatioOptions.find((option) => option.value === '16:9') ?? doubaoVideoRatioOptions[0]
      const defaultDuration = doubaoVideoDurationOptions.find((option) => option.value === '5') ?? doubaoVideoDurationOptions[0]

      // eslint-disable-next-line react-hooks/set-state-in-effect -- 换模型重置为豆包默认 720p/16:9/5s——产品行为，用户 2026-09-23 确认保留
      if (defaultResolution) setVideoResolution(defaultResolution.value)
      if (defaultRatio) setAspectRatio(defaultRatio.value)
      if (defaultDuration) setVideoDuration(defaultDuration.value)
    }
  }, [isDoubaoVideo, doubaoVideoResolutionOptions, doubaoVideoRatioOptions, doubaoVideoDurationOptions])

  useEffect(() => {
    if (!isWanxVideo || !wanxVideoResolutionOptions || !wanxVideoRatioOptions || !wanxVideoDurationOptions) return

    const defaultResolution = wanxVideoResolutionOptions.find((option) => option.value === '720P') ?? wanxVideoResolutionOptions[0]
    const defaultRatio = wanxVideoRatioOptions.find((option) => option.value === '16:9') ?? wanxVideoRatioOptions[0]

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换模型重置为万相默认 720P/16:9——产品行为，用户 2026-09-23 确认保留
    if (defaultResolution) setVideoResolution(defaultResolution.value)
    if (defaultRatio) setAspectRatio(defaultRatio.value)
  }, [isWanxVideo, selectedModelId, wanxVideoResolutionOptions, wanxVideoRatioOptions, wanxVideoDurationOptions])

  useEffect(() => {
    if (!isWanxVideo || !wanxVideoDurationOptions || wanxVideoDurationOptions.length === 0) return
    if (wanxVideoDurationOptions.some((option) => option.value === videoDuration)) return

    const fallbackDuration =
      wanxVideoDurationOptions.find((option) => option.value === '5') ??
      wanxVideoDurationOptions[0]

    if (fallbackDuration) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 新模型不支持当前时长时回退到 5s——产品行为，用户 2026-09-23 确认保留
      setVideoDuration(fallbackDuration.value)
    }
  }, [isWanxVideo, videoDuration, wanxVideoDurationOptions])

  // 文件转 base64 工具函数
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result as string
        resolve(base64)
      }
      reader.onerror = reject
    })
  }

  const toBase64FromUrl = async (url: string): Promise<string> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch project asset: ${response.status}`)
    }

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = () => {
        resolve(reader.result as string)
      }
      reader.onerror = reject
    })
  }

  const uploadReferenceInputs = async (
    kind: 'image' | 'video' | 'audio',
    files: File[],
    provider?: 'seedance' | 'wanx',
  ) => {
    if (files.length === 0) return []
    const result = await videoService.uploadSeedanceInputs(kind, files, provider)
    return result.files.map((item) => item.url)
  }


  const createMentionInlineNode = (
    tokenId: string,
    kind: MentionMediaKind,
    referenceLabel: string,
    previewUrl?: string | null
  ) => {
    const mentionNode = document.createElement('span')
    mentionNode.setAttribute('data-mention-id', tokenId)
    mentionNode.setAttribute('contenteditable', 'false')
    mentionNode.className =
      'relative mx-1 inline-flex items-center gap-2 rounded-xl border border-aurora-purple/30 bg-aurora-purple/5 px-2.5 py-1.5 pr-6 align-middle shadow-sm'

    const thumbWrap = document.createElement('span')
    thumbWrap.className = `flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border ${getMentionMediaTone(kind)}`

    if (kind === 'image' && previewUrl) {
      const img = document.createElement('img')
      img.src = previewUrl
      img.alt = referenceLabel
      img.setAttribute('data-mention-thumb', 'true')
      img.className = 'h-full w-full object-cover'
      thumbWrap.appendChild(img)
    } else {
      const badge = document.createElement('span')
      badge.className = 'text-[9px] font-semibold tracking-[0.18em]'
      badge.textContent = getMentionMediaBadge(kind)
      thumbWrap.appendChild(badge)
    }

    const label = document.createElement('span')
    label.setAttribute('data-mention-label', 'true')
    label.className = 'text-xs font-medium text-stone-700 dark:text-stone-200'
    label.textContent = referenceLabel

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.setAttribute('data-remove-mention', tokenId)
    removeBtn.className =
      'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-stone-700/80 text-[10px] leading-none text-white transition-colors hover:bg-red-500'
    removeBtn.title = '删除引用'
    removeBtn.textContent = '×'

    mentionNode.appendChild(thumbWrap)
    mentionNode.appendChild(label)
    mentionNode.appendChild(removeBtn)
    return mentionNode
  }

  const handlePromptEditorInput = () => {
    syncMentionTokensWithEditor()
    syncPromptWithEditor()
  }

  const handlePromptEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== '@') return

    if (mentionableMedia.length === 0) {
      event.preventDefault()
      toast.error(t('form.prompt.mentionUnavailable'))
      return
    }

    event.preventDefault()

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      mentionInsertRangeRef.current = selection.getRangeAt(0).cloneRange()
    }

    setShowMentionPicker(true)
  }

  const handleOpenMentionPicker = () => {
    if (mentionableMedia.length === 0) {
      toast.error(t('form.prompt.mentionUnavailable'))
      return
    }

    const editor = promptTextareaRef.current
    if (editor) {
      editor.focus()

      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        mentionInsertRangeRef.current = selection.getRangeAt(0).cloneRange()
      } else {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        mentionInsertRangeRef.current = range
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }

    setShowMentionPicker(true)
  }

  const handleSelectMentionMedia = (mediaIndex: number) => {
    const selectedMedia = mentionableMedia[mediaIndex]
    if (!selectedMedia) return

    const token: MentionToken = {
      id: nextMentionTokenId(),
      source: selectedMedia.source,
      file: selectedMedia.file,
      assetId: selectedMedia.asset?.id || null,
      kind: selectedMedia.kind,
    }

    const editor = promptTextareaRef.current
    if (!editor) return

    const selection = window.getSelection()
    let range = mentionInsertRangeRef.current?.cloneRange() ?? null

    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
    }

    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const mentionNode = createMentionInlineNode(
      token.id,
      selectedMedia.kind,
      getMentionReferenceLabel(selectedMedia.kind, selectedMedia.ordinal),
      mentionPreviewUrls[mediaIndex]
    )
    const spacer = document.createTextNode(' ')

    range.deleteContents()
    range.insertNode(spacer)
    range.insertNode(mentionNode)

    const caretRange = document.createRange()
    caretRange.setStartAfter(spacer)
    caretRange.collapse(true)
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(caretRange)
    }

    setMentionTokens((prev) => [...prev, token])
    setShowMentionPicker(false)
    mentionInsertRangeRef.current = null
    editor.focus()
    syncPromptWithEditor()
  }

  const handleRemoveMentionToken = (tokenId: string) => {
    const editor = promptTextareaRef.current
    if (editor) {
      const mentionNode = editor.querySelector<HTMLElement>(`[data-mention-id="${tokenId}"]`)
      mentionNode?.remove()
    }
    setMentionTokens((prev) => prev.filter((token) => token.id !== tokenId))
    syncPromptWithEditor()
  }

  const handlePromptEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const removeButton = target.closest('[data-remove-mention]') as HTMLElement | null
    if (!removeButton) return

    event.preventDefault()
    event.stopPropagation()
    const tokenId = removeButton.getAttribute('data-remove-mention')
    if (!tokenId) return
    handleRemoveMentionToken(tokenId)
  }

  const buildRequestPrompt = () => {
    const editor = promptTextareaRef.current
    if (!editor) return normalizePromptForRequest(prompt).trim()

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const element = node as HTMLElement
      const mentionId = element.dataset.mentionId
      if (mentionId) {
        const mentionReference = getMentionReferenceByTokenId(mentionId)
        return mentionReference ? mentionReference.label : ''
      }
      if (element.tagName === 'BR') return '\n'

      const content = (Array.from(element.childNodes) as Node[]).map((child) => walk(child)).join('')
      if (element.tagName === 'DIV' || element.tagName === 'P') return `${content}\n`
      return content
    }

    return normalizePromptForRequest(
      (Array.from(editor.childNodes) as Node[])
        .map((node) => walk(node))
        .join('')
    )
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // AI 提示词优化
  const handleOptimizePrompt = async () => {
    const requestPrompt = buildRequestPrompt()
    if (!requestPrompt) {
      toast.error(t('errors.promptRequired'))
      return
    }

    setIsOptimizing(true)
    setOptimizedPrompts([])
    setShowOptimizeResult(true)
    setoptimizeText('')

    try {
      // Build request body
      const body: { prompt: string; images?: string[]; modelType?: string } = {
        prompt: requestPrompt,
      }
      if (includeImagesInOptimize && inputImages.length > 0) {
        body.images = await Promise.all(inputImages.map(toBase64))
      }
      // 传递当前选择的模型 provider，用于选择不同的优化策略
      if (selectedModel?.provider) {
        body.modelType = selectedModel.provider
      }

      const result = await promptOptimizeService.optimizePrompt(body)
      const fullText = typeof result.content === 'string' ? result.content.trim() : ''
      if (!fullText) {
        throw new Error(t('form.prompt.optimizeError'))
      }
      setoptimizeText(fullText)

      // Parse 3 versions from the full text
      const versions: string[] = []
      const parts = fullText.split(/---[123]---/)
      for (const part of parts) {
        const trimmed = part.trim()
        if (trimmed) versions.push(trimmed)
      }

      if (versions.length > 0) {
        setOptimizedPrompts(versions.slice(0, 3))
      } else {
        // Fallback: treat entire text as one version
        setOptimizedPrompts([fullText.trim()])
      }
    } catch (error) {
      console.error('Prompt optimization failed:', error)
      const message = error instanceof Error ? error.message : ''
      toast.error(message || t('form.prompt.optimizeError'))
      setShowOptimizeResult(false)
    } finally {
      setIsOptimizing(false)
    }
  }

  // 处理提交
  const handleSubmit = async () => {
    const requestPrompt = buildRequestPrompt()
    const hasImageReferenceInputs = inputImages.length > 0 || selectedProjectImageAssets.length > 0
    const totalImageReferenceCount = inputImages.length + selectedProjectImageAssets.length
    const totalVideoReferenceImageCount = videoInputImages.length + selectedProjectImageAssets.length
    const totalDoubaoReferenceImageCount = doubaoReferenceImages.length + selectedProjectImageAssets.length
    const totalDoubaoReferenceVideoCount = doubaoReferenceVideos.length + selectedProjectVideoAssets.length
    const totalWanxReferenceImageCount = wanxReferenceImages.length + selectedProjectImageAssets.length
    const totalWanxReferenceVideoCount = wanxReferenceVideos.length + selectedProjectVideoAssets.length
    const totalWanxReferenceVisualCount = totalWanxReferenceImageCount + totalWanxReferenceVideoCount
    const totalWanxFirstFrameCount = wanxFirstFrameImages.length
    const totalWanxLastFrameCount = wanxLastFrameImages.length
    const totalWanxAudioCount = wanxReferenceAudios.length

    // 换模型不清素材（用户可能传了十张图），不兼容留到这里拦：说清楚哪不行，东西不动。
    const assetChecks: AssetCheck[] = isWanxVideo
      ? [
          { kind: 'image', count: totalWanxReferenceImageCount, supported: supportsImageInput, max: wanxReferenceImageUploadMaxFiles },
          { kind: 'video', count: totalWanxReferenceVideoCount, supported: wanxAllowsReferenceVideoInputs, max: wanxReferenceVideoUploadMaxFiles },
          { kind: 'audio', count: totalWanxAudioCount, supported: wanxSupportsAudioInput, max: wanxReferenceAudioUploadMaxFiles },
          { kind: 'frame', count: totalWanxFirstFrameCount + totalWanxLastFrameCount, supported: wanxSupportsFirstFrameInput, max: wanxSupportsLastFrameInput ? 2 : 1 },
        ]
      : isDoubaoVideo
        ? [
            { kind: 'image', count: totalDoubaoReferenceImageCount, supported: supportsImageInput, max: isDoubaoSeedance20 ? seedanceReferenceImageUploadMaxFiles : doubaoReferenceUploadMaxFiles },
            { kind: 'video', count: totalDoubaoReferenceVideoCount, supported: isDoubaoSeedance20, max: seedanceReferenceVideoUploadMaxFiles },
            { kind: 'frame', count: doubaoFrameImages.length, supported: true, max: 2 },
          ]
        : [
            { kind: 'image', count: totalVideoReferenceImageCount, supported: supportsImageInput, max: standardVideoReferenceUploadMaxFiles },
          ]

    const assetIssue = findAssetIssue(assetChecks)
    if (assetIssue) {
      const described = describeAssetIssue(assetIssue)
      toast.error(t(described.key, { ...described.params, kind: t(described.kindKey) }))
      return
    }

    if (!selectedModelId) {
      toast.error(t('errors.selectModel'))
      return
    }

    if (activeTab === 'video' && !selectedExecutionModel) {
      toast.error(t('errors.selectModel'))
      return
    }

    if (!requestPrompt) {
      toast.error(t('errors.promptRequired'))
      return
    }

    if (activeTab === 'image' && supportsImageInput && totalImageReferenceCount > maxInputImages) {
      toast.error(t('errors.referenceLimitReached', { max: maxInputImages }))
      return
    }

    if (activeTab === 'video' && isWanxVideo) {
      if (isWanxHappyhorseVideo && wanxResolvedModelKind !== 't2v' && totalWanxAudioCount > 0) {
        toast.error(t('errors.wanxReferenceAudioLimit'))
        return
      }

      if (isWanxHappyhorseVideo && totalWanxLastFrameCount > 0) {
        toast.error(t('errors.wanxLastFrameUnsupported'))
        return
      }

      if (isWanxHappyhorseVideo && wanxResolvedModelKind === 'r2v' && totalWanxReferenceVideoCount > 0) {
        toast.error(t('errors.wanxReferenceVideoUnsupported'))
        return
      }

      if (wanxResolvedModelKind === 'r2v') {
        if (totalWanxReferenceVisualCount < 1) {
          toast.error(t('errors.wanxReferenceRequired'))
          return
        }

        if (totalWanxReferenceVisualCount > 5) {
          toast.error(t('errors.wanxReferenceVisualLimit'))
          return
        }

        if (totalWanxAudioCount > 0 && !wanxSupportsAudioInput) {
          toast.error(t('errors.wanxReferenceAudioLimit'))
          return
        }

        if (totalWanxAudioCount > totalWanxReferenceVisualCount) {
          toast.error(t('errors.wanxAudioNeedsVisual'))
          return
        }
      }

      if (wanxResolvedModelKind === 'i2v') {
        if (totalWanxLastFrameCount > 1) {
          toast.error(t('errors.wanxI2vSingleLastFrame'))
          return
        }

        if (totalWanxAudioCount > 1) {
          toast.error(t('errors.wanxSingleAudioOnly'))
          return
        }

        if (totalWanxFirstFrameCount > 1) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxFirstFrameCount > 0 && totalWanxReferenceImageCount > 0) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxReferenceImageCount > 1) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxReferenceVideoCount > 1) {
          toast.error(t('errors.wanxI2vSingleVideo'))
          return
        }

        if (wanxVideoContinuationEnabled && totalWanxReferenceVideoCount < 1) {
          toast.error(t('errors.wanxContinuationVideoRequired'))
          return
        }
      }

      if (wanxResolvedModelKind === 't2v' && totalWanxAudioCount > 1) {
        toast.error(t('errors.wanxSingleAudioOnly'))
        return
      }
    }

    if (activeTab === 'video' && !isDoubaoSeedance20) {
      if (isDoubaoVideo && totalDoubaoReferenceImageCount > 4) {
        toast.error(t('errors.referenceLimitReached', { max: 4 }))
        return
      }

      if (!isDoubaoVideo && !isWanxVideo && supportsImageInput && totalVideoReferenceImageCount > maxInputImages) {
        toast.error(t('errors.referenceLimitReached', { max: maxInputImages }))
        return
      }
    }

    if (activeTab === 'video' && isDoubaoSeedance20) {
      if (hasDoubaoSeedance20ReferenceInputs && hasDoubaoSeedance20FrameInputs) {
        toast.error(t('errors.doubaoModesExclusive'))
        return
      }

      if (totalDoubaoReferenceImageCount > 9) {
        toast.error(t('errors.doubaoReferenceImageLimit'))
        return
      }

      if (totalDoubaoReferenceVideoCount > 3) {
        toast.error(t('errors.doubaoReferenceVideoLimit'))
        return
      }

      if (doubaoReferenceAudios.length > 3) {
        toast.error(t('errors.doubaoReferenceAudioLimit'))
        return
      }

      if (doubaoReferenceAudios.length > 0 && totalDoubaoReferenceImageCount === 0 && totalDoubaoReferenceVideoCount === 0) {
        toast.error(t('errors.doubaoAudioNeedsMedia'))
        return
      }
    }

    setLoading(true)

    try {
      const requestModel = activeTab === 'video' ? selectedExecutionModel : selectedModel

      // 构建参数对象（根据API文档，不同provider需要不同的参数格式）
      const parameters: Record<string, unknown> = {}

      if (activeTab === 'image') {
        // 图片生成参数 - 根据不同provider使用不同的参数名和格式
        if (isQwenImage) {
          // Qwen / 通义千问：使用 DashScope multimodal-generation，同步返回图片 URL
          parameters.size = aspectRatio
          parameters.n = 1
          parameters.watermark = false
          if (selectedModel?.capabilities?.remoteModel) {
            parameters.model = selectedModel.capabilities.remoteModel
          }
        } else if (isGptImage) {
          // GPT Image: 使用 size 参数（如 "1024x1024", "1536x1024", "auto"）
          parameters.size = aspectRatio
          // 根据是否有输入图片决定使用 generations 或 edits 接口
          parameters.gptImageOperation = hasImageReferenceInputs ? 'edits' : 'generations'
          parameters.model = selectedModel?.capabilities?.remoteModel || 'gpt-image-2-all'
        } else if (isNanoBananaPro) {
          // Nano Banana Pro / Gemini Pro: 使用 aspectRatio 和 imageSize
          if (supportsSizeSelect) {
            parameters.aspectRatio = aspectRatio
          }
          parameters.responseModalities = ['IMAGE']
          if (supportsResolutionSelect) {
            parameters.imageSize = imageSize
          }
        } else if (isNanoBanana) {
          // Nano Banana / Gemini: 使用 aspectRatio
          if (supportsSizeSelect) {
            parameters.aspectRatio = aspectRatio
          }
          if (supportsResolutionSelect) {
            parameters.imageSize = imageSize
          }
          parameters.responseModalities = ['IMAGE']
        } else if (isDoubao) {
          // 豆包: 使用 size 参数（"2K"/"4K"）
          parameters.size = imageSize
          parameters.response_format = 'url'
          parameters.watermark = false // 默认不显示水印
          if (selectedModel?.capabilities?.remoteModel) {
            parameters.model = selectedModel.capabilities.remoteModel
          }
        } else if (isMidjourney) {
          // Midjourney: botType 通过 API 请求体传递，其他参数后端会拼接到 prompt
          parameters.botType = mjBotType
          parameters.aspectRatio = aspectRatio
          if (mjVersion) parameters.version = mjVersion
          if (mjStylize) parameters.stylize = mjStylize
          if (mjChaos) parameters.chaos = mjChaos
          if (mjQuality) parameters.quality = mjQuality
          if (mjWeird) parameters.weird = mjWeird
          if (mjIw) parameters.iw = mjIw
          if (mjNo) parameters.no = mjNo
          if (mjStyle) parameters.style = mjStyle
          if (mjSeed) parameters.seed = mjSeed
          if (mjTile) parameters.tile = true
          if (mjPersonalize) parameters.personalize = true
        } else {
          // 其他provider：使用 aspectRatio
          parameters.aspectRatio = aspectRatio
        }
      } else {
        if (isWanxVideo) {
          parameters.resolution = videoResolution || '720P'
          parameters.duration = parseInt(videoDuration) || 5
          if (wanxCanCustomizeRatio) {
            parameters.ratio = aspectRatio
          }
          if (requestModel?.capabilities?.remoteModel) {
            parameters.model = requestModel.capabilities.remoteModel
          }
        } else if (isDoubaoVideo) {
          // 豆包 - resolution, ratio, duration, watermark
          parameters.resolution = videoResolution || '720p'
          parameters.ratio = aspectRatio
          parameters.duration = parseInt(videoDuration) || 5
          parameters.watermark = false // 默认无水印
          if (requestModel?.capabilities?.remoteModel) {
            parameters.model = requestModel.capabilities.remoteModel
          }
          if (isDoubaoSeedance20) {
            parameters.generate_audio = doubaoGenerateAudio
          }
        }
      }

      // 处理输入图片（转base64，根据API文档不同provider有不同的参数名）
      if (activeTab === 'image' && (inputImages.length > 0 || selectedProjectImageAssets.length > 0)) {
        const [localBase64Array, projectBase64Array] = await Promise.all([
          Promise.all(inputImages.map(toBase64)),
          Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
        ])
        const base64Array = [...localBase64Array, ...projectBase64Array]

        // 图片生成 - 根据provider使用不同的参数名
        if (selectedModel?.provider?.toLowerCase().includes('midjourney') || selectedModel?.provider?.toLowerCase().includes('mj')) {
          // Midjourney支持多图垫图（base64Array）
          // 注意：Midjourney 的 base64Array 需要去掉 data:image/...;base64, 前缀
          parameters.base64Array = base64Array.map((x) => (x.includes(',') ? x.split(',')[1] : x))
        } else if (isQwenImage) {
          // Qwen / 通义千问：直接传 images 数组，后端会转换为 messages[].content[].image
          parameters.images = base64Array
        } else if (isGptImage) {
          // GPT Image：单张用 image (string)，多张用 images (array)
          if (base64Array.length === 1) {
            parameters.image = base64Array[0]
          } else {
            parameters.images = base64Array
          }
        } else if (isDoubao) {
          // 豆包：使用 image 参数（单张为 string，多张为 array）
          parameters.image = base64Array.length === 1 ? base64Array[0] : base64Array
        } else if (isNanoBanana || isNanoBananaPro) {
          // Nano Banana / Gemini：使用 images 数组（支持多图垫图/多图生图）
          parameters.images = base64Array
          parameters.imageFirst = true
        } else {
          // 其他provider通常使用单图（imageBase64 或 imageUrl）
          parameters.imageBase64 = base64Array[0]
        }
      }

      if (activeTab === 'video') {
        // 视频参考素材参数按当前保留的视频提供商格式生成
        if (isWanxVideo) {
          const [
            uploadedReferenceImageUrls,
            uploadedReferenceVideoUrls,
            uploadedReferenceAudioUrls,
            uploadedFirstFrameUrls,
            uploadedLastFrameUrls,
          ] = await Promise.all([
            uploadReferenceInputs('image', wanxReferenceImages, 'wanx'),
            wanxAllowsReferenceVideoInputs
              ? uploadReferenceInputs('video', wanxReferenceVideos, 'wanx')
              : Promise.resolve([]),
            wanxSupportsAudioInput
              ? uploadReferenceInputs('audio', wanxReferenceAudios, 'wanx')
              : Promise.resolve([]),
            wanxSupportsFirstFrameInput
              ? uploadReferenceInputs('image', wanxFirstFrameImages, 'wanx')
              : Promise.resolve([]),
            wanxSupportsLastFrameInput
              ? uploadReferenceInputs('image', wanxLastFrameImages, 'wanx')
              : Promise.resolve([]),
          ])

          const referenceImageUrls = [...uploadedReferenceImageUrls, ...selectedProjectImageAssets.map((asset) => asset.url)]
          const referenceVideoUrls = [...uploadedReferenceVideoUrls, ...selectedProjectVideoAssets.map((asset) => asset.url)]
          const explicitFirstFrameUrl = uploadedFirstFrameUrls[0]
          const explicitLastFrameUrl = uploadedLastFrameUrls[0]

          if (wanxResolvedModelKind === 't2v') {
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls[0]) {
              parameters.audioUrl = uploadedReferenceAudioUrls[0]
            }
          } else if (wanxResolvedModelKind === 'i2v') {
            const firstFrameUrl = explicitFirstFrameUrl || referenceImageUrls[0]

            if (firstFrameUrl) {
              parameters.firstFrame = firstFrameUrl
            }
            if (referenceVideoUrls[0]) {
              parameters.firstClip = referenceVideoUrls[0]
            }
            if (wanxSupportsLastFrameInput && explicitLastFrameUrl) {
              parameters.lastFrame = explicitLastFrameUrl
            }
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls[0]) {
              parameters.drivingAudio = uploadedReferenceAudioUrls[0]
            }
          } else {
            if (referenceImageUrls.length > 0) {
              parameters.referenceImages = referenceImageUrls
            }
            if (!isWanxHappyhorseVideo && referenceVideoUrls.length > 0) {
              parameters.referenceVideos = referenceVideoUrls
            }
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls.length > 0) {
              parameters.referenceAudios = uploadedReferenceAudioUrls
            }
            if (!isWanxHappyhorseVideo && explicitFirstFrameUrl) {
              parameters.firstFrame = explicitFirstFrameUrl
            }
          }
        } else if (isDoubaoVideo) {
          if (isDoubaoSeedance20) {
            if (hasDoubaoSeedance20FrameInputs) {
              const frameUrls = await uploadReferenceInputs('image', doubaoFrameImages)
              parameters.firstFrame = frameUrls[0]
              if (frameUrls[1]) {
                parameters.lastFrame = frameUrls[1]
              }
            } else {
              const [uploadedReferenceImageUrls, uploadedReferenceVideoUrls, referenceAudioUrls] = await Promise.all([
                uploadReferenceInputs('image', doubaoReferenceImages),
                uploadReferenceInputs('video', doubaoReferenceVideos),
                uploadReferenceInputs('audio', doubaoReferenceAudios),
              ])
              const referenceImageUrls = [...uploadedReferenceImageUrls, ...selectedProjectImageAssets.map((asset) => asset.url)]
              const referenceVideoUrls = [...uploadedReferenceVideoUrls, ...selectedProjectVideoAssets.map((asset) => asset.url)]

              if (referenceImageUrls.length > 0) {
                parameters.referenceImages = referenceImageUrls
              }
              if (referenceVideoUrls.length > 0) {
                parameters.referenceVideos = referenceVideoUrls
              }
              if (referenceAudioUrls.length > 0) {
                parameters.referenceAudios = referenceAudioUrls
              }
            }
          } else if (doubaoReferenceImages.length > 0 || selectedProjectImageAssets.length > 0) {
            const [localBase64Array, projectBase64Array] = await Promise.all([
              Promise.all(doubaoReferenceImages.map(toBase64)),
              Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
            ])
            const base64Array = [...localBase64Array, ...projectBase64Array]
            parameters.referenceImages = base64Array
          } else if (doubaoFrameImages.length > 0) {
            const base64Array = await Promise.all(doubaoFrameImages.map(toBase64))
            parameters.firstFrame = base64Array[0]
            if (base64Array.length > 1) {
              parameters.lastFrame = base64Array[1]
            }
          }
        } else if (videoInputImages.length > 0 || selectedProjectImageAssets.length > 0) {
          const [localBase64Array, projectBase64Array] = await Promise.all([
            Promise.all(videoInputImages.map(toBase64)),
            Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
          ])
          const base64Array = [...localBase64Array, ...projectBase64Array]
          parameters.referenceImages = base64Array
        }
      }

      const requestData = {
        modelId: activeTab === 'video' ? (selectedExecutionModel?.id || selectedModelId) : selectedModelId,
        prompt: requestPrompt,
        negativePrompt: negativePrompt.trim() || undefined,
        projectId: selectedProjectId || undefined,
        ...(activeTab === 'image' && selectedProjectId
          ? { skipProjectPromptTransform: true }
          : {}),
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      }

      // 结果在右栏就地出现，不再跳走；图片多张 = 并发提交多个任务
      const keys = addPlaceholders(activeTab, activeTab === 'image' ? imageCount : 1)
      // 窄屏时右栏在下方，滚过去让用户看到占位卡片
      if (window.innerWidth < 1024) {
        resultsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      const settled = await Promise.allSettled(
        keys.map(() =>
          activeTab === 'image' ? imageService.generate(requestData) : videoService.generate(requestData),
        ),
      )
      let firstError: unknown = null
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          resolveJob(keys[index], result.value)
        } else {
          failJobs([keys[index]], classifyFailure(result.reason))
          if (firstError === null) firstError = result.reason
        }
      })
      // 失败原因已经写在右栏卡片上；这里再抛出去，让下面沿用原来的提示（含「去配置渠道」入口）
      if (firstError !== null) throw firstError

      toast.success(t('success.title'))
    } catch (error: unknown) {
      console.error('Failed to create task:', error)

      const failure = classifyFailure(error)

      // 配置没补齐时，重试多少次都不会成功，所以直接把入口递到手上
      toast.error(tFailure(failure.kind), {
        duration: 8000,
        description: failure.detail
          ? tFailure('detail', { detail: failure.detail })
          : undefined,
        action: isConfigurationFailure(failure.kind)
          ? {
              label: tFailure('channelMissingAction'),
              onClick: () => setIsConfigOpen(true),
            }
          : undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  // 「有没有内容」从 state 推，不在渲染期读编辑器 DOM：
  // prompt 每次输入都由 syncPromptWithEditor 同步，@提及单独记在 mentionTokens 里。
  // 渲染期读 ref 里的 DOM（原来的 buildRequestPrompt()）React 看不见变化，按钮的禁用状态可能不跟手。
  // 提交时仍然走 buildRequestPrompt()——那是在事件处理里，读 DOM 没问题。
  const hasRequestPrompt = Boolean(normalizePromptForRequest(prompt).trim()) || mentionTokens.length > 0
  // 只用 setter 和 ref，没有响应式依赖 → 引用永远稳定，放进别的依赖数组不会引起重跑
  const applyPromptDraft = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt)
    setShowOptimizeResult(false)
    setOptimizedPrompts([])
    const editor = promptTextareaRef.current
    if (editor) {
      editor.textContent = nextPrompt
    }
  }, [])

  const handleApplyVideoSample = useCallback((sample: VideoModelSample, options?: { scroll?: boolean }) => {
    setActiveTab('video')
    const modelId = findSampleModelId(models, sample)
    if (modelId) setSelectedModelId(modelId)
    if (sample.duration) setVideoDuration(sample.duration)
    if (sample.ratio) setAspectRatio(sample.ratio)
    applyPromptDraft(sample.prompt)
    toast.success(`${t('videoSamples.apply')}: ${sample.tag}`)
    if (options?.scroll === false) return
    window.requestAnimationFrame(() => {
      document.getElementById('create-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [models, applyPromptDraft, t])

  // 右栏案例：视频案例连模型 / 时长 / 比例一起带；图片案例带提示词和画幅
  const handleApplyShowcaseCase = (item: CreateShowcaseCase) => {
    if (item.sample) {
      handleApplyVideoSample(item.sample, { scroll: false })
      return
    }
    applyPromptDraft(item.prompt)
    if (item.ratio && aspectRatioOptions.some((option) => option.value === item.ratio)) {
      setAspectRatio(item.ratio)
    }
    toast.success(t('studio.applied', { title: item.title }))
  }

  useEffect(() => {
    const requestedSampleId = searchParams.get('sample')
    if (!requestedSampleId || models.length === 0) return
    if (appliedSampleIdRef.current === requestedSampleId) return
    const sample = VIDEO_MODEL_SAMPLES.find((item) => item.id === requestedSampleId)
    if (!sample) return
    appliedSampleIdRef.current = requestedSampleId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 的 ?sample= 只回填一次（ref 防重复）
    handleApplyVideoSample(sample)
  }, [models, searchParams, handleApplyVideoSample])
  const seedanceSwitchClassName =
    'h-6 w-11 rounded-full border border-stone-300 shadow-sm data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-stone-300 dark:border-stone-500 dark:data-[state=unchecked]:bg-stone-600'
  // 页面是纯视频了，这个徽标显示当前是首尾帧创作还是参考创作
  const modeBadgeLabel = t(`tabs.${createMode}`)
  const projectSummaryText = (projectsLoading || projectAssetsLoading)
    ? t('projectContext.loading')
    : selectedProject
      ? selectedProject.name
      : t('projectContext.none')
  const quickStartPrompts = useMemo(() => networkPrompts, [networkPrompts])
  const quickStartSourceLabel = t(
    activeTab === 'video' ? 'featuredTemplates.sources.systemVideo' : 'featuredTemplates.sources.system',
  )
  const quickStartCategories = useMemo(() => {
    return ['all', ...new Set(quickStartPrompts.map((item) => item.category).filter(Boolean) as string[])]
  }, [quickStartPrompts])
  const filteredQuickStartPrompts = useMemo(() => {
    return quickStartPrompts.filter((item) => {
      if (quickStartCategory === 'all') return true
      return item.category === quickStartCategory
    })
  }, [quickStartCategory, quickStartPrompts])
  const quickStartEmptyTitle = t('featuredTemplates.emptySystem')
  const quickStartEmptyDescription = t('featuredTemplates.emptySystemDesc')

  const getQuickStartCardDescription = (item: Prompt) => {
    return item.prompt.trim().replace(/\s+/g, ' ')
  }

  const renderModelCard = () => (
    <section className="min-w-0">
      <div className="studio-field-heading">
        <strong>{t('studio.fieldModel')}</strong>
        <span className="studio-optional">{modeBadgeLabel}</span>
        {models.length > 0 ? (
          <span className="ml-auto truncate text-[11px] text-[color:var(--studio-faint)]">{t('simple.modelSwitchHint')}</span>
        ) : null}
      </div>
      <SimplifiedModelSelector
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        type={activeTab}
        compact
        onChannelsConfigured={() => setModelsReloadToken((token) => token + 1)}
      />
    </section>
  )

  // 「当前生成配置」摘要：把散在各处的参数汇总成一句人话，生成前给用户核对。
  const simpleSummary = (() => {
    const typeLabel = activeTab === 'video' ? t('models.typeVideo') : t('models.typeImage')
    const ratioLabel =
      aspectRatioOptions.find((option) => option.value === aspectRatio)?.label || aspectRatio

    const outputParts = [typeLabel]
    if (ratioLabel) outputParts.push(ratioLabel)
    if (activeTab === 'video') {
      if (videoDuration) outputParts.push(`${videoDuration} ${t('simple.secondsUnit')}`)
      if (videoResolution) outputParts.push(videoResolution)
    } else {
      if (supportsResolutionSelect && imageSize) outputParts.push(imageSize)
      if (imageCount > 1) outputParts.push(`× ${imageCount}`)
    }

    const blocker = !selectedModelId
      ? t('simple.missingModel')
      : !hasRequestPrompt
        ? t('simple.missingPrompt')
        : null

    return {
      blocker,
      modelName: selectedModel?.name || '-',
      output: outputParts.join(' · '),
      ratioLabel,
    }
  })()

  const studioSummary: StudioSummary = (() => {
    const outputCell = {
      label: t('studio.cellOutput'),
      value: simpleSummary.ratioLabel || t('studio.defaultRatio'),
      sub:
        activeTab === 'video'
          ? videoResolution || t('models.typeVideo')
          : supportsResolutionSelect && imageSize
            ? imageSize
            : t('models.typeImage'),
    }
    const modelCell = {
      label: t('studio.cellModel'),
      value: selectedModel?.name || t('studio.noModel'),
      sub: selectedModel?.provider || '',
    }

    if (activeTab === 'video') {
      return {
        ready: !simpleSummary.blocker,
        statusLabel: simpleSummary.blocker ?? t('simple.ready'),
        cells: [
          outputCell,
          {
            label: t('studio.cellDuration'),
            value: t('studio.secondsValue', { value: videoDuration || '5' }),
            sub: simpleSummary.ratioLabel || t('studio.defaultRatio'),
          },
          { label: t('studio.cellCount'), value: t('studio.countVideos', { count: 1 }), sub: t('models.typeVideo') },
          modelCell,
        ],
        noteTitle: t('studio.noteVideoTitle'),
        noteText: t('studio.noteVideoText', { duration: videoDuration || '5' }),
      }
    }

    const referenceCount = inputImages.length + selectedProjectImageAssets.length
    return {
      ready: !simpleSummary.blocker,
      statusLabel: simpleSummary.blocker ?? t('simple.ready'),
      cells: [
        outputCell,
        {
          label: t('studio.cellReference'),
          value: referenceCount > 0 ? t('studio.referenceCount', { count: referenceCount }) : t('studio.noReference'),
          sub: modeBadgeLabel,
        },
        { label: t('studio.cellCount'), value: t('studio.countImages', { count: imageCount }), sub: t('studio.parallel') },
        modelCell,
      ],
      noteTitle: t('studio.noteImageTitle', { mode: modeBadgeLabel }),
      noteText: creationMode === 'image-to-image' ? t('studio.noteImageToImage') : t('studio.noteTextToImage'),
    }
  })()

  // 生成按钮：左栏最后一块，跟随页面滚动；参数摘要在右栏「当前生成配置」
  const renderGenerateCard = () => (
    <section className="space-y-2.5 border-t border-[color:var(--studio-line)] pt-5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-[color:var(--studio-muted)]">{simpleSummary.output}</span>
        <span className={cn('shrink-0 font-medium', simpleSummary.blocker ? 'text-[color:var(--studio-gold)]' : 'text-emerald-400')}>
          {simpleSummary.blocker ?? t('simple.ready')}
        </span>
      </div>
      {/* 走站长两个中转站时才显示价格；图片一次出几张就按几张算 */}
      <RelayPriceNote
        price={priceFor(activeTab === 'video' ? (selectedExecutionModel ?? selectedModel) : selectedModel)}
        count={activeTab === 'image' ? imageCount : 1}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !selectedModelId || !hasRequestPrompt}
        className="studio-gold-button"
      >
        {loading ? (
          <>
            <Clock className="h-4 w-4 animate-spin" />
            {t('actions.generating')}
          </>
        ) : (
          <>
            <ArrowUp className="h-4 w-4" />
            {activeTab === 'video' ? t('studio.createVideo') : t('studio.createImage')}
          </>
        )}
      </button>
    </section>
  )

  return (
    // 工作台皮肤；深浅跟随站点主题（2026-09-23 用户要求「跟随系统」），所以根节点不再写死 .dark
    <div className="studio-skin min-h-screen w-full">
    <PageTransition className="create-page-no-edge-glow mx-auto w-full max-w-[1560px] px-4 py-6 pb-24 sm:px-6 md:pb-12 lg:px-8">
      <Tabs className="block w-full min-w-0" value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)}>
        <>
          <section id="create-workbench" className="scroll-mt-28 mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <span className="studio-kicker">
                {activeTab === 'video' ? t('studio.kickerVideo') : t('studio.kickerImage')}
              </span>
              <h1 className="studio-display mt-2 text-4xl md:text-5xl">
                {activeTab === 'video' ? t('studio.headingVideo') : t('studio.headingImage')}
              </h1>
              <p className="mt-3 text-sm text-[color:var(--studio-muted)]">
                {activeTab === 'video' ? t('studio.subheadingVideo') : t('studio.subheadingImage')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="studio-outline-button"
                onClick={() =>
                  document.getElementById('create-presets')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {t('studio.browsePresets')}
              </button>
              <Link href={`/${locale}/tasks`} className="studio-outline-button">
                {t('studio.viewTasks')}
              </Link>
            </div>
          </section>
        </>

        {/* 左栏配置 / 右栏结果（参考 creative-studio 的 520px + 自适应两栏）；1024px 以下上下排 */}
        <div className="studio-workspace grid min-w-0 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div className="studio-left min-w-0 space-y-8 p-4 sm:p-6">
            {/* 模式卡：照参考站「首尾帧模式 / 参考模式」的两张卡，这里是图片 / 视频 */}
            {/* 模式卡：照参考站「首尾帧模式 / 参考模式」。两种都出视频，区别是给模型什么输入 */}
            <TabsList className="studio-mode-tabs grid h-auto w-full min-w-0 grid-cols-2 gap-1.5 p-[3px]">
              {CREATE_MODES.map((mode) => (
                <TabsTrigger key={mode.key} value={mode.key} className="studio-mode-tab min-w-0">
                  <strong>{t(`tabs.${mode.key}`)}</strong>
                  <small>{t(mode.key === 'frames' ? 'studio.modeFramesDesc' : 'studio.modeReferencesDesc')}</small>
                </TabsTrigger>
              ))}
            </TabsList>

            {renderModelCard()}

            {activeTab === 'video' ? (
              <VideoCreateWorkspace
                locale={locale}
                createMode={createMode}
                prompt={prompt}
                applyPromptDraft={applyPromptDraft}
                promptEditorRef={promptEditorRef}
                promptTextareaRef={promptTextareaRef}
                mentionableMedia={mentionableMedia}
                mentionPreviewUrls={mentionPreviewUrls}
                showMentionPicker={showMentionPicker}
                onPromptEditorInput={handlePromptEditorInput}
                onPromptEditorKeyDown={handlePromptEditorKeyDown}
                onPromptEditorClick={handlePromptEditorClick}
                onOpenMentionPicker={handleOpenMentionPicker}
                onSelectMentionMedia={handleSelectMentionMedia}
                projectContextLoading={projectsLoading || projectAssetsLoading}
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProjectId={setSelectedProjectId}
                selectedProject={selectedProject}
                projectAssets={projectAssets}
                usableProjectAssets={usableProjectAssets}
                selectedProjectAssetIds={selectedProjectAssetIds}
                disabledProjectAssetIds={disabledProjectAssetIds}
                onToggleProjectAsset={handleToggleProjectAsset}
                supportsImageInput={supportsImageInput}
                selectedModel={selectedModel}
                isWanxVideo={isWanxVideo}
                isWanxMergedVideo={isWanxMergedVideo}
                isWanx27Video={isWanx27Video}
                wanxResolvedModelKind={wanxResolvedModelKind}
                wanxSupportsAudioInput={wanxSupportsAudioInput}
                wanxAllowsReferenceVideoInputs={wanxAllowsReferenceVideoInputs}
                wanxSupportsFirstFrameInput={wanxSupportsFirstFrameInput}
                wanxSupportsLastFrameInput={wanxSupportsLastFrameInput}
                wanxReferenceVideosAreContinuationOnly={isWanxHappyhorseVideo}
                wanxCanCustomizeRatio={wanxCanCustomizeRatio}
                wanxHasReferenceVideoInputs={wanxHasReferenceVideoInputs}
                wanxVideoContinuationEnabled={wanxVideoContinuationEnabled}
                setWanxVideoContinuationEnabled={setWanxVideoContinuationEnabled}
                isDoubaoVideo={isDoubaoVideo}
                isDoubaoSeedance20={isDoubaoSeedance20}
                hasDoubaoSeedance20ReferenceInputs={hasDoubaoSeedance20ReferenceInputs}
                hasDoubaoSeedance20FrameInputs={hasDoubaoSeedance20FrameInputs}
                videoInputImages={videoInputImages}
                setVideoInputImages={setVideoInputImages}
                doubaoReferenceImages={doubaoReferenceImages}
                setDoubaoReferenceImages={setDoubaoReferenceImages}
                doubaoReferenceVideos={doubaoReferenceVideos}
                setDoubaoReferenceVideos={setDoubaoReferenceVideos}
                doubaoReferenceAudios={doubaoReferenceAudios}
                setDoubaoReferenceAudios={setDoubaoReferenceAudios}
                doubaoFrameImages={doubaoFrameImages}
                setDoubaoFrameImages={setDoubaoFrameImages}
                wanxReferenceImages={wanxReferenceImages}
                setWanxReferenceImages={setWanxReferenceImages}
                wanxReferenceVideos={wanxReferenceVideos}
                setWanxReferenceVideos={setWanxReferenceVideos}
                wanxReferenceAudios={wanxReferenceAudios}
                setWanxReferenceAudios={setWanxReferenceAudios}
                wanxFirstFrameImages={wanxFirstFrameImages}
                setWanxFirstFrameImages={setWanxFirstFrameImages}
                wanxLastFrameImages={wanxLastFrameImages}
                setWanxLastFrameImages={setWanxLastFrameImages}
                doubaoGenerateAudio={doubaoGenerateAudio}
                setDoubaoGenerateAudio={setDoubaoGenerateAudio}
                seedanceSwitchClassName={seedanceSwitchClassName}
                videoDuration={videoDuration}
                setVideoDuration={setVideoDuration}
                videoResolution={videoResolution}
                setVideoResolution={setVideoResolution}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                wanxVideoResolutionOptions={wanxVideoResolutionOptions}
                wanxVideoRatioOptions={wanxVideoRatioOptions}
                wanxVideoDurationOptions={wanxVideoDurationOptions}
                doubaoVideoResolutionOptions={doubaoVideoResolutionOptions}
                doubaoVideoRatioOptions={doubaoVideoRatioOptions}
                doubaoVideoDurationOptions={doubaoVideoDurationOptions}
                standardVideoReferenceUploadMaxFiles={standardVideoReferenceUploadMaxFiles}
                wanxReferenceImageUploadMaxFiles={wanxReferenceImageUploadMaxFiles}
                wanxReferenceVideoUploadMaxFiles={wanxReferenceVideoUploadMaxFiles}
                wanxReferenceAudioUploadMaxFiles={wanxReferenceAudioUploadMaxFiles}
                doubaoReferenceUploadMaxFiles={doubaoReferenceUploadMaxFiles}
                seedanceReferenceImageUploadMaxFiles={seedanceReferenceImageUploadMaxFiles}
                seedanceReferenceVideoUploadMaxFiles={seedanceReferenceVideoUploadMaxFiles}
              />
            ) : (
              <div className="min-w-0 space-y-5">
                <>
                  <Card className="studio-field relative min-w-0">
                    <div className="studio-field-heading">
                      <strong>{t('studio.fieldContent')}</strong>
                    </div>
                    <CardContent className="space-y-4 p-0">
                      <div className="space-y-2">
                        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {t('form.prompt.label')}
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </label>
                        <div ref={promptEditorRef} className="relative min-w-0">
                          <div
                            ref={promptTextareaRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={handlePromptEditorInput}
                            onKeyDown={handlePromptEditorKeyDown}
                            onClick={handlePromptEditorClick}
                            data-placeholder={t('form.prompt.placeholder')}
                            className="min-h-[120px] w-full overflow-x-hidden break-words rounded-[24px] border-2 border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-3 pr-14 font-ui text-[15px] text-stone-900 shadow-canvas transition-all duration-300 hover:border-stone-300 hover:shadow-canvas-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-aurora-purple sm:min-h-[112px] sm:px-6 sm:pr-16 sm:text-base dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(28,32,44,0.92),rgba(17,24,39,0.96))] dark:text-stone-100 dark:hover:border-stone-500 empty:before:pointer-events-none empty:before:text-stone-400 dark:empty:before:text-stone-500 empty:before:content-[attr(data-placeholder)]"
                          />

                          <button
                            type="button"
                            onClick={handleOpenMentionPicker}
                            className="absolute right-2.5 top-2.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-aurora-purple/30 bg-white/90 px-2 font-ui text-sm font-semibold text-aurora-purple shadow-sm transition-colors hover:bg-aurora-purple/10 sm:right-3 sm:top-3 sm:h-9 sm:min-w-9 sm:rounded-xl dark:border-aurora-purple/40 dark:bg-stone-800/90 dark:text-aurora-pink dark:hover:bg-aurora-purple/15"
                            title={t('form.prompt.mentionButtonTitle')}
                          >
                            @
                          </button>

                          {showMentionPicker && mentionableMedia.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-canvas-lg sm:p-3 dark:border-stone-700 dark:bg-stone-900">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                                  {t('form.prompt.mentionPickerTitle')}
                                </p>
                                <span className="text-xs text-stone-500 dark:text-stone-400">
                                  {t('form.prompt.mentionPickerCount', { count: mentionableMedia.length })}
                                </span>
                              </div>
                              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                {mentionableMedia.map((media, index) => {
                                  const mentionLabel = getMentionReferenceLabel(media.kind, media.ordinal)
                                  const previewUrl = mentionPreviewUrls[index]
                                  const mediaName = getMentionMediaDisplayName(media)

                                  return (
                                    <button
                                      key={`${media.source}-${media.kind}-${mediaName}-${index}`}
                                      type="button"
                                      onClick={() => handleSelectMentionMedia(index)}
                                      className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-left transition-colors hover:border-aurora-purple/40 hover:bg-aurora-purple/5 sm:gap-3 sm:px-3 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-aurora-purple/40 dark:hover:bg-aurora-purple/10"
                                    >
                                      <div
                                        className={cn(
                                          'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border sm:h-14 sm:w-14',
                                          getMentionMediaTone(media.kind)
                                        )}
                                      >
                                        {media.kind === 'image' && previewUrl ? (
                                          <img
                                            src={previewUrl}
                                            alt={mediaName}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <span className="text-[10px] font-semibold tracking-[0.2em]">
                                            {getMentionMediaBadge(media.kind)}
                                          </span>
                                        )}
                                        <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                                          {mentionLabel}
                                        </span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                                          {mentionLabel}
                                        </p>
                                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                                          {getMentionMediaTypeLabel(media.kind)} · {mediaName}
                                        </p>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Lightbulb className="h-3 w-3" />
                          {t('form.prompt.hint')}
                        </p>

                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] transition-all hover:border-aurora-purple/35 hover:shadow-[0_20px_48px_-30px_rgba(124,58,237,0.24)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_20px_48px_-34px_rgba(2,6,23,0.84)] dark:hover:border-aurora-purple/35 dark:hover:bg-stone-900 sm:w-auto sm:min-w-[236px]"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-aurora-purple/12 text-aurora-purple dark:bg-aurora-purple/18 dark:text-aurora-pink">
                                  <Wand2 className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                                    {t('form.prompt.optimize')}
                                  </span>
                                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                                    {isOptimizing
                                      ? t('form.prompt.optimizing')
                                      : showOptimizeResult && optimizedPrompts.length > 0
                                        ? t('form.prompt.optimizedResult')
                                        : t('form.prompt.optimize')}
                                  </span>
                                </span>
                                {showOptimizeResult && optimizedPrompts.length > 0 ? (
                                  <span className="rounded-full bg-aurora-purple/10 px-2 py-1 text-[11px] font-medium text-aurora-purple">
                                    {optimizedPrompts.length}
                                  </span>
                                ) : null}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={10}
                              className="z-[70] !w-[min(96vw,680px)] rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_32px_90px_-38px_rgba(15,23,42,0.42)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_36px_96px_-38px_rgba(2,6,23,0.88)]"
                            >
                              <div className="space-y-3">
                                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                                  {t('form.prompt.optimize')}
                                </p>
                                <PromptOptimizePanel
                                  isOptimizing={isOptimizing}
                                  showOptimizeResult={showOptimizeResult}
                                  optimizeText={optimizeText}
                                  optimizedPrompts={optimizedPrompts}
                                  hasRequestPrompt={hasRequestPrompt}
                                  onOptimizePrompt={handleOptimizePrompt}
                                  onUsePrompt={(optimizedPrompt) => {
                                    applyPromptDraft(optimizedPrompt)
                                    toast.success(t('form.prompt.useOptimized'))
                                  }}
                                  canIncludeImages={inputImages.length > 0}
                                  includeImages={includeImagesInOptimize}
                                  onToggleIncludeImages={setIncludeImagesInOptimize}
                                />
                              </div>
                            </PopoverContent>
                          </Popover>

                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] transition-all hover:border-aurora-purple/35 hover:shadow-[0_20px_48px_-30px_rgba(124,58,237,0.24)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_20px_48px_-34px_rgba(2,6,23,0.84)] dark:hover:border-aurora-purple/35 dark:hover:bg-stone-900 sm:w-auto sm:min-w-[236px]"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-900/10 text-stone-700 dark:bg-white/10 dark:text-stone-100">
                                  <FolderKanban className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                                    {t('projectContext.title')}
                                  </span>
                                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                                    {projectSummaryText}
                                  </span>
                                </span>
                                {selectedUsableProjectAssetCount > 0 ? (
                                  <span className="rounded-full bg-aurora-purple/10 px-2 py-1 text-[11px] font-medium text-aurora-purple">
                                    {selectedUsableProjectAssetCount}
                                  </span>
                                ) : null}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={10}
                              className="z-[70] !w-[min(96vw,760px)] rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_32px_90px_-38px_rgba(15,23,42,0.42)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_36px_96px_-38px_rgba(2,6,23,0.88)]"
                            >
                              <ProjectContextPanel
                                locale={locale}
                                loading={projectsLoading || projectAssetsLoading}
                                projects={projects}
                                selectedProjectId={selectedProjectId}
                                onSelectProjectId={setSelectedProjectId}
                                selectedProject={selectedProject}
                                projectAssets={projectAssets}
                                usableAssets={usableProjectAssets}
                                selectedAssetIds={selectedProjectAssetIds}
                                disabledAssetIds={disabledProjectAssetIds}
                                onToggleAsset={handleToggleProjectAsset}
                                supportsReferenceAssets={supportsImageInput}
                              />
                            </PopoverContent>
                          </Popover>

                        </div>
                      </div>


                      <Separator />

                      {supportsImageInput && (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <ImageIconSolid className="h-4 w-4" />
                              {t('form.uploadReference.label')}
                              {(inputImages.length > 0 || selectedProjectImageAssets.length > 0) && (
                                <span className="text-xs text-primary">
                                  （{t(`form.uploadReference.mode.${creationMode === 'image-to-image' ? 'imageToImage' : 'textToImage'}`)}）
                                </span>
                              )}
                            </label>
                            {selectedModel?.capabilities?.limits?.maxInputImages && (
                              <span className="text-xs text-muted-foreground">
                                {t('form.uploadReference.maxFiles', {
                                  max: imageReferenceUploadMaxFiles,
                                })}
                              </span>
                            )}
                          </div>

                          <ImageDropzone
                            value={inputImages}
                            onChange={setInputImages}
                            maxFiles={imageReferenceUploadMaxFiles}
                            maxSize={10}
                            accept="image/png,image/jpeg"
                            disabled={imageReferenceUploadMaxFiles === 0}
                          />

                          {inputImages.length > 0 ? (
                            <p className="text-xs text-primary flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" />
                              {t('form.uploadReference.hintWithImages', { count: inputImages.length })}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              {t('form.uploadReference.hint')}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>

                <>
                  <Card className="studio-field relative min-w-0">
                    <div className="studio-field-heading">
                      <strong>{t('studio.fieldParams')}</strong>
                      <span className="studio-optional">{t('studio.optional')}</span>
                    </div>
                    <CardContent className="space-y-4 p-0">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-stone-700 dark:text-stone-200">
                            {t('simple.countLabel')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setImageCount(count)}
                                className={cn(
                                  'min-w-12 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                                  imageCount === count
                                    ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-stone-600',
                                )}
                              >
                                {count}
                                {t('simple.countUnit')}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(isNanoBanana || isNanoBananaPro) ? (
                          <>
                            {supportsSizeSelect && (
                              <AspectRatioSelect
                                label={t('form.parameters.aspectRatio')}
                                value={aspectRatio}
                                onChange={setAspectRatio}
                                options={aspectRatioOptions}
                                showPreview={true}
                              />
                            )}
                            {supportsResolutionSelect && (
                              <AspectRatioSelect
                                label={t('form.parameters.imageSize')}
                                value={imageSize}
                                onChange={setImageSize}
                                options={imageSizeOptions || NANO_BANANA_IMAGE_SIZE_OPTIONS}
                                showPreview={false}
                              />
                            )}
                          </>
                        ) : isDoubao && imageSizeOptions ? (
                          <AspectRatioSelect
                            label={t('form.parameters.imageSize')}
                            value={imageSize}
                            onChange={setImageSize}
                            options={imageSizeOptions}
                            showPreview={false}
                          />
                        ) : (isQwenImage || isGptImage) && aspectRatioOptions.length > 0 ? (
                          <AspectRatioSelect
                            label={t('form.parameters.imageResolution')}
                            value={aspectRatio}
                            onChange={setAspectRatio}
                            options={aspectRatioOptions}
                            showPreview={false}
                          />
                        ) : isMidjourney ? (
                          <>
                            <AspectRatioSelect
                              label={t('form.parameters.aspectRatio')}
                              value={aspectRatio}
                              onChange={setAspectRatio}
                              options={COMMON_ASPECT_RATIO_OPTIONS}
                              showPreview={true}
                            />
                            <AspectRatioSelect
                              label={t('form.parameters.mjBotType')}
                              value={mjBotType}
                              onChange={setMjBotType}
                              options={MIDJOURNEY_BOT_TYPE_OPTIONS}
                              showPreview={false}
                            />

                            <div className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setMjAdvancedOpen(!mjAdvancedOpen)}
                                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                              >
                                <span>{t('form.parameters.mjAdvanced')}</span>
                                <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-200 ${mjAdvancedOpen ? 'rotate-180' : ''}`} />
                              </button>

                              {mjAdvancedOpen && (
                                <div className="px-4 pb-4 space-y-4 border-t border-stone-100 dark:border-stone-700">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4">
                                    <AspectRatioSelect
                                      label={t('form.parameters.mjVersion')}
                                      value={mjVersion}
                                      onChange={setMjVersion}
                                      options={MIDJOURNEY_VERSION_OPTIONS}
                                      showPreview={false}
                                    />
                                    <AspectRatioSelect
                                      label={t('form.parameters.mjQuality')}
                                      value={mjQuality}
                                      onChange={setMjQuality}
                                      options={MIDJOURNEY_QUALITY_OPTIONS}
                                      showPreview={false}
                                    />
                                  </div>

                                  <AspectRatioSelect
                                    label={t('form.parameters.mjStyleRaw')}
                                    value={mjStyle}
                                    onChange={setMjStyle}
                                    options={MIDJOURNEY_STYLE_OPTIONS}
                                    showPreview={false}
                                  />

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjStylize')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={mjStylize}
                                        onChange={(event: { target: { value: string } }) => setMjStylize(event.target.value)}
                                        placeholder="0-1000"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjChaos')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={mjChaos}
                                        onChange={(event: { target: { value: string } }) => setMjChaos(event.target.value)}
                                        placeholder="0-100"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjWeird')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="3000"
                                        value={mjWeird}
                                        onChange={(event: { target: { value: string } }) => setMjWeird(event.target.value)}
                                        placeholder="0-3000"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjIw')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="3"
                                        step="0.1"
                                        value={mjIw}
                                        onChange={(event: { target: { value: string } }) => setMjIw(event.target.value)}
                                        placeholder="0-3"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.seed')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="4294967295"
                                        value={mjSeed}
                                        onChange={(event: { target: { value: string } }) => setMjSeed(event.target.value)}
                                        placeholder={t('form.parameters.mjSeedPlaceholder')}
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjNo')}
                                      </label>
                                      <input
                                        type="text"
                                        value={mjNo}
                                        onChange={(event: { target: { value: string } }) => setMjNo(event.target.value)}
                                        placeholder={t('form.parameters.mjNoPlaceholder')}
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={mjTile}
                                        onChange={(event: { target: { checked: boolean } }) => setMjTile(event.target.checked)}
                                        className="rounded border-stone-300 bg-white text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800"
                                      />
                                      <span className="text-sm text-stone-700 dark:text-stone-300">{t('form.parameters.mjTile')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={mjPersonalize}
                                        onChange={(event: { target: { checked: boolean } }) => setMjPersonalize(event.target.checked)}
                                        className="rounded border-stone-300 bg-white text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800"
                                      />
                                      <span className="text-sm text-stone-700 dark:text-stone-300">{t('form.parameters.mjPersonalize')}</span>
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        ) : aspectRatioOptions.length > 0 ? (
                          <AspectRatioSelect
                            label={t('form.parameters.aspectRatio')}
                            value={aspectRatio}
                            onChange={setAspectRatio}
                            options={aspectRatioOptions}
                            showPreview={true}
                          />
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </>
              </div>
            )}

            {/* 不做 sticky：固定在底部会一直盖住下面的参数卡片（用户反馈） */}
            {renderGenerateCard()}
          </div>

          <aside
            ref={resultsPanelRef}
            className="min-w-0 scroll-mt-24 p-4 sm:p-6"
          >
            <CreateStudioPanel
              locale={locale}
              cases={activeTab === 'video' ? VIDEO_SHOWCASE_CASES : IMAGE_SHOWCASE_CASES}
              onApplyCase={handleApplyShowcaseCase}
              jobs={sessionJobs}
              onClearJobs={clearFinished}
              onConfigure={() => setIsConfigOpen(true)}
              summary={studioSummary}
              onMoreCases={() =>
                document.getElementById('create-presets')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
          </aside>
        </div>

        {/* 灵感预设：照参考站「从提示词到视频」区块 —— 金色小标签 + 衬线大标题 + 4 列卡片；右栏「更多案例」和顶部「浏览预设」滚到这里 */}
        <section id="create-presets" className="mt-16 scroll-mt-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <span className="studio-kicker">{t('studio.presetsKicker')}</span>
              <h2 className="studio-display mt-2 text-3xl md:text-[42px]">
                {t('studio.presetsTitleLine1')}
                <br />
                {t('studio.presetsTitleLine2')}
              </h2>
              <p className="mt-3 text-sm text-[color:var(--studio-muted)]">{t('studio.presetsSub')}</p>
            </div>
            <span className="studio-gold-link shrink-0 text-xs">
              {t('studio.presetsCount', { count: quickStartPrompts.length })}
            </span>
          </div>

          {quickStartCategories.length > 1 ? (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {quickStartCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setQuickStartCategory(category)}
                  className={cn(
                    'rounded-[3px] border px-3 py-1.5 text-xs transition-colors',
                    quickStartCategory === category
                      ? 'border-[color:var(--studio-gold)] bg-[color:var(--studio-gold)] font-semibold text-[#17120a]'
                      : 'border-[color:var(--studio-line)] bg-[color:var(--studio-field)] text-[color:var(--studio-muted)] hover:text-[color:var(--studio-text)]',
                  )}
                >
                  {category === 'all' ? t('featuredTemplates.categoryAll') : category}
                </button>
              ))}
            </div>
          ) : null}

          {quickStartLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`preset-skeleton-${index}`}
                  className="h-[300px] animate-pulse border border-[color:var(--studio-line)] bg-[#0e1112]"
                />
              ))}
            </div>
          ) : filteredQuickStartPrompts.length === 0 ? (
            <div className="border border-dashed border-[color:var(--studio-line)] px-5 py-10 text-center">
              <p className="text-sm font-medium text-[color:var(--studio-text)]">{quickStartEmptyTitle}</p>
              <p className="mt-2 text-xs leading-6 text-[color:var(--studio-muted)]">{quickStartEmptyDescription}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(quickStartExpanded
                  ? filteredQuickStartPrompts
                  : filteredQuickStartPrompts.slice(0, QUICK_START_VISIBLE_COUNT)
                ).map((tpl) => (
                  <article
                    key={`${tpl.title}-${tpl.created}-${tpl.link}`}
                    className="group flex min-w-0 flex-col border border-[color:var(--studio-line)] bg-[#0e1112] transition-colors hover:border-[color:var(--studio-line-strong)]"
                  >
                    <button
                      type="button"
                      onClick={() => applyNetworkPrompt(tpl)}
                      className="relative block w-full overflow-hidden bg-[#07090a] text-left"
                      style={{ aspectRatio: '16 / 9' }}
                    >
                      {tpl.preview ? (
                        <img
                          src={tpl.preview}
                          alt={tpl.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center bg-[radial-gradient(circle_at_25%_15%,rgba(217,155,69,0.2),transparent_60%)] px-5">
                          <p className="line-clamp-3 text-sm leading-6 text-white/75">{getQuickStartCardDescription(tpl)}</p>
                        </div>
                      )}
                      {tpl.category ? (
                        <span className="absolute left-2.5 top-2.5 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                          {tpl.category}
                        </span>
                      ) : null}
                      <span className="absolute right-2.5 top-2.5 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        {t(`tabs.${createMode}`)}
                      </span>
                    </button>
                    <div className="flex flex-1 flex-col p-4">
                      <strong className="truncate text-base font-bold text-[color:var(--studio-text)]">{tpl.title}</strong>
                      <p className="mt-1 truncate text-xs text-[color:var(--studio-muted)]">
                        {[tpl.category, tpl.sub_category].filter(Boolean).join(' · ') || quickStartSourceLabel}
                      </p>
                      <button
                        type="button"
                        onClick={() => applyNetworkPrompt(tpl)}
                        className="mt-4 flex items-center justify-between border border-[color:var(--studio-line)] px-3 py-2.5 text-xs text-[color:var(--studio-gold)] transition-colors hover:border-[color:var(--studio-gold)]"
                      >
                        {t('studio.applyPreset')}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {filteredQuickStartPrompts.length > QUICK_START_VISIBLE_COUNT ? (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setQuickStartExpanded((value) => !value)}
                    className="studio-outline-button"
                  >
                    {quickStartExpanded
                      ? t('featuredTemplates.showLess')
                      : t('featuredTemplates.showMore', { count: filteredQuickStartPrompts.length })}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </Tabs>

      <SystemConfigModal
        isOpen={isConfigOpen}
        onClose={() => {
          setIsConfigOpen(false)
          setModelsReloadToken((token) => token + 1)
        }}
      />
    </PageTransition>
    </div>
  )
}
