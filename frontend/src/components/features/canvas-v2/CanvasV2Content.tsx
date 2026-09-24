'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  ViewportPortal,
  type Connection,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Download,
  FilePlus2,
  Hand,
  ImageDown,
  LayoutGrid,
  MousePointer2,
  Play,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageTransition } from '@/components/shared/PageTransition'
import { useTranslations } from '@/i18n/client'
import { useMediaModels } from '@/lib/hooks/useMediaModels'
import { useStudioBodySkin } from '@/lib/hooks/useStudioBodySkin'

import { AssistantPanel } from './assistant/AssistantPanel'
import { type CanvasNodeKind } from './canvasV2.types'
import { CANVAS_PRESETS, type CanvasPreset } from './data/presets'
import { slashGeneratorCount, slashGeneratorData, slashTextPrompt, type SlashCommandKey } from './data/slashCommands'
import { exportCanvasPng } from './io/exportPng'
import { downloadProjectFile, parseProjectFile, readFileAsText } from './io/projectFile'
import { edgeTypes, nodeTypes } from './nodes'
import { computeAlignment } from './store/alignGuides'
import { nextNodeId, useCanvasStore } from './store/canvasStore'
import { absolutePosition, nodeSize, orientConnection, tidyLayout } from './store/graphOps'
import { autoGroup, groupNodes, groupsToUngroup, toggleAllGroups, ungroupNodes } from './store/grouping'
import { extractSelection, instantiateGraph, type Graph } from './store/graphPersist'
import { NodeRunProvider } from './store/NodeRunProvider'
import { useBoardSync, type SaveState } from './store/useBoardSync'
import { useCascade } from './store/useCascade'
import { LibraryPanel, type MediaDrop } from './panels/LibraryPanel'
import { VersionsPanel } from './panels/VersionsPanel'
import { CanvasSearch, type CanvasAction } from './toolbar/CanvasSearch'

/** 左侧「新建节点」面板里的分组；分组名查 canvas.groups.<key> */
const NODE_GROUPS: { key: string; kinds: CanvasNodeKind[] }[] = [
  { key: 'generator', kinds: ['imageGenerator', 'videoGenerator', 'audioGenerator'] },
  { key: 'media', kinds: ['image', 'video', 'audio'] },
  { key: 'text', kinds: ['text', 'markdown', 'stickyNote'] },
  { key: 'structure', kinds: ['promptGroup', 'director', 'script', 'videoStitch'] },
]

/** 左侧栏四个标签：搭积木（新建节点 + 预设）、助手（节点详情 + 对话指挥）、素材（模板 / 资产库 / 生成日志）、版本（快照） */
type SidebarTab = 'build' | 'assistant' | 'library' | 'versions'
const SIDEBAR_TABS: SidebarTab[] = ['build', 'assistant', 'library', 'versions']

/** 默认「移动」：左键拖动平移画布，按住 Shift/Ctrl 临时框选；「框选」反过来，按住空格临时平移 */
type InteractionMode = 'pan' | 'select'

/** 画布视图开关，按浏览器记住（只是个人习惯，丢了也无所谓） */
type ViewPrefs = { snapToGrid: boolean; alignGuides: boolean; minimap: boolean }
const VIEW_PREFS_KEY = 'molagg.canvas.view'
const DEFAULT_VIEW_PREFS: ViewPrefs = { snapToGrid: false, alignGuides: true, minimap: true }
/** 网格吸附的格子跟背景点阵同一个间距，吸上去刚好落在点上 */
const GRID = 22
/** 对齐参考线：屏幕上离另一个节点的边 / 中线多近算贴上 */
const GUIDE_SNAP_PX = 6

function readViewPrefs(): ViewPrefs {
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_KEY)
    return raw ? { ...DEFAULT_VIEW_PREFS, ...(JSON.parse(raw) as Partial<ViewPrefs>) } : DEFAULT_VIEW_PREFS
  } catch {
    return DEFAULT_VIEW_PREFS
  }
}

function saveViewPrefs(prefs: ViewPrefs) {
  try {
    window.localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 隐私模式 / 禁了存储：这次会话照样生效，只是下次不记得
  }
}

const selectedIds = () =>
  useCanvasStore
    .getState()
    .nodes.filter((node) => node.selected)
    .map((node) => node.id)

/** 工具栏上的自动保存状态 */
function SaveIndicator({ state }: { state: SaveState }) {
  const t = useTranslations('canvas')
  const label = {
    loading: t('board.loading'),
    saved: t('board.saved'),
    saving: t('board.saving'),
    failed: t('board.failed'),
    offline: t('board.offline'),
  }[state]
  return (
    <span
      className={state === 'failed' || state === 'offline' ? 'cv2-save cv2-save-warn' : 'cv2-save'}
      title={state === 'offline' ? t('board.offlineHint') : undefined}
    >
      {label}
    </span>
  )
}

/** 拖动时的对齐参考线，画在画布坐标系里（跟着缩放平移走） */
function AlignGuideLines({ guides }: { guides: { vertical: number | null; horizontal: number | null } | null }) {
  const { zoom } = useViewport()
  if (!guides) return null
  const thickness = 1 / zoom
  return (
    <ViewportPortal>
      {guides.vertical !== null && (
        <div className="cv2-guide" style={{ left: guides.vertical, top: -100000, width: thickness, height: 200000 }} />
      )}
      {guides.horizontal !== null && (
        <div className="cv2-guide" style={{ top: guides.horizontal, left: -100000, height: thickness, width: 200000 }} />
      )}
    </ViewportPortal>
  )
}

function CanvasBoard() {
  const t = useTranslations('canvas')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('build')
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const onNodesChange = useCanvasStore((state) => state.onNodesChange)
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const addNode = useCanvasStore((state) => state.addNode)
  const removeNodes = useCanvasStore((state) => state.removeNodes)
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes)
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)
  const clear = useCanvasStore((state) => state.clear)
  const commit = useCanvasStore((state) => state.commit)
  const loadProject = useCanvasStore((state) => state.loadProject)
  const toProjectFile = useCanvasStore((state) => state.toProjectFile)

  const { screenToFlowPosition, fitView, getNodesBounds, getZoom } = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const importModeRef = useRef<'replace' | 'merge'>('replace')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<InteractionMode>('pan')
  const [prefs, setPrefs] = useState<ViewPrefs>(readViewPrefs)
  const [guides, setGuides] = useState<{ vertical: number | null; horizontal: number | null } | null>(null)

  const imageModels = useMediaModels('image').models
  const videoModels = useMediaModels('video').models
  const cascadeModels = useMemo(() => ({ image: imageModels, video: videoModels }), [imageModels, videoModels])
  const cascade = useCascade(cascadeModels)
  const { boardId, saveState } = useBoardSync()

  const togglePref = (key: keyof ViewPrefs) =>
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] }
      saveViewPrefs(next)
      return next
    })

  // 视图菜单：点外面就收起
  useEffect(() => {
    if (!viewMenuOpen) return
    const close = (event: MouseEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) setViewMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [viewMenuOpen])

  /** 在画布坐标系里新建节点；没给屏幕坐标就放在视口中间偏左 */
  const addAt = useCallback(
    (kind: CanvasNodeKind, screen?: { x: number; y: number }, data?: Record<string, unknown>) => {
      const position = screenToFlowPosition(screen ?? { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 120 })
      setMenu(null)
      return addNode(kind, position, data)
    },
    [addNode, screenToFlowPosition],
  )

  const applyPreset = useCallback(
    (preset: CanvasPreset) => {
      const origin = screenToFlowPosition({ x: 220, y: 160 })
      const idMap = new Map<string, string>()
      preset.nodes.forEach((node) => {
        const id = addNode(
          node.kind,
          { x: origin.x + node.position.x, y: origin.y + node.position.y },
          {
            // 预设里的标题是具体名字（「正面角色图（参考基准）」），不是节点类型名，
            // 所以按铺开时的语言写死；用户接着还要自己改它。
            title: t(`presets.${preset.key}.nodes.${node.ref}`),
            ...(node.seedPrompt ? { prompt: t(`presets.${preset.key}.prompts.${node.ref}`) } : {}),
            ...node.data,
          },
        )
        idMap.set(node.ref, id)
      })
      preset.edges.forEach((edge) => {
        const source = idMap.get(edge.from)
        const target = idMap.get(edge.to)
        if (source && target) onConnect({ source, target, sourceHandle: null, targetHandle: null })
      })
      toast.success(t('presets.applied', { name: t(`presets.${preset.key}.name`) }))
    },
    [addNode, onConnect, screenToFlowPosition, t],
  )

  /** 用户手动连线：从生成器拖到素材上的，反过来连并告诉他（程序内部的连线不走这里） */
  const handleConnect = useCallback(
    (connection: Connection) => {
      const oriented = orientConnection(connection, useCanvasStore.getState().nodes)
      onConnect(oriented.connection)
      if (oriented.flipped) toast.info(t('flow.edgeAutoFlipped'))
    },
    [onConnect, t],
  )

  /** 拖动一个顶层节点时，贴近别的节点的边 / 中线就吸过去，并画出参考线 */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const [change] = changes
      let next = changes
      if (prefs.alignGuides && changes.length === 1 && change.type === 'position' && change.position) {
        if (!change.dragging) {
          setGuides(null)
        } else {
          const all = useCanvasStore.getState().nodes
          const node = all.find((item) => item.id === change.id)
          if (node && !node.parentId) {
            const size = nodeSize(node)
            const others = all
              .filter((item) => item.id !== node.id && !item.parentId && !item.hidden)
              .map((item) => ({ ...item.position, ...nodeSize(item) }))
            const aligned = computeAlignment({ ...change.position, ...size }, others, GUIDE_SNAP_PX / getZoom())
            next = [{ ...change, position: { x: aligned.x, y: aligned.y } }]
            setGuides(
              aligned.vertical === null && aligned.horizontal === null
                ? null
                : { vertical: aligned.vertical, horizontal: aligned.horizontal },
            )
          }
        }
      } else if (guides && changes.some((item) => item.type === 'position' && !item.dragging)) {
        setGuides(null)
      }
      onNodesChange(next)
    },
    [getZoom, guides, onNodesChange, prefs.alignGuides],
  )

  const focusNode = useCallback(
    (id: string) => {
      onNodesChange(
        useCanvasStore.getState().nodes.map((node) => ({ type: 'select', id: node.id, selected: node.id === id })),
      )
      void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2 })
    },
    [fitView, onNodesChange],
  )

  const groupSelection = useCallback(() => {
    const result = groupNodes(useCanvasStore.getState().nodes, selectedIds(), nextNodeId('group'))
    if (!result.ok) {
      toast.error(result.reason === 'noNesting' ? t('group.noNesting') : t('group.needTwo'))
      return
    }
    commit({ nodes: result.nodes })
    toast.success(
      result.mediaOnly ? t('group.mediaGrouped', { n: result.count }) : t('group.grouped', { n: result.count }),
    )
  }, [commit, t])

  const ungroupSelection = useCallback(() => {
    const { nodes: all, edges: allEdges } = useCanvasStore.getState()
    const groupIds = groupsToUngroup(all, selectedIds())
    if (groupIds.length === 0) {
      toast.error(t('group.ungroupNeedsSelection'))
      return
    }
    commit(ungroupNodes(all, allEdges, groupIds))
    toast.success(groupIds.length === 1 ? t('group.ungroupedOne') : t('group.ungroupedMany', { n: groupIds.length }))
  }, [commit, t])

  const tidy = useCallback(() => {
    const { nodes: all, edges: allEdges } = useCanvasStore.getState()
    if (all.length === 0) {
      toast.error(t('tidy.empty'))
      return
    }
    commit({ nodes: tidyLayout(all, allEdges) })
    // 等 React Flow 拿到新坐标再缩放到全图
    window.requestAnimationFrame(() => void fitView({ duration: 300 }))
    toast.success(t('tidy.done'))
  }, [commit, fitView, t])

  const groupByWorkflow = useCallback(() => {
    const { nodes: all, edges: allEdges } = useCanvasStore.getState()
    const result = autoGroup(all, allEdges, () => nextNodeId('group'))
    if (result.count === 0) {
      toast.error(t('view.nothingToGroup'))
      return
    }
    commit({ nodes: result.nodes })
    toast.success(t('view.autoGrouped', { n: result.count }))
  }, [commit, t])

  const toggleGroups = useCallback(() => {
    const result = toggleAllGroups(useCanvasStore.getState().nodes)
    if (result.count === 0) {
      toast.error(t('view.noGroups'))
      return
    }
    commit({ nodes: result.nodes })
    toast.success(
      result.collapsed ? t('view.collapsedAll', { n: result.count }) : t('view.expandedAll', { n: result.count }),
    )
  }, [commit, t])

  const exportPng = useCallback(async () => {
    const visible = useCanvasStore.getState().nodes.filter((node) => !node.hidden)
    const bounds = visible.length ? getNodesBounds(visible) : null
    const result = await exportCanvasPng(bounds, `molagg-canvas-${Date.now()}.png`)
    if (result === 'ok') toast.success(t('exportPng.done'))
    else if (result === 'empty') toast.error(t('exportPng.empty'))
    else toast.error(t('exportPng.failed'))
  }, [getNodesBounds, t])

  /**
   * 斜杠命令。选中了图：建一个生成器、把图连进去、打光 / 角度勾好；
   * 没选：建一个装着提示词的文字节点。都只是搭好，不会自动生成。
   */
  const runSlash = useCallback(
    (key: SlashCommandKey) => {
      const all = useCanvasStore.getState().nodes
      const byId = new Map(all.map((node) => [node.id, node]))
      const images = all.filter((node) => node.selected && node.type === 'image')
      const isLight = key === 'light'

      if (images.length === 0) {
        addAt('text', undefined, {
          title: isLight ? t('slash.light.textTitle') : t('slash.angle.textTitle'),
          text: slashTextPrompt(key),
        })
        toast.success(isLight ? t('slash.light.createdTextNode') : t('slash.angle.createdTextNode'))
        return
      }

      const right = Math.max(...images.map((node) => absolutePosition(node, byId).x + nodeSize(node).width))
      const top = Math.min(...images.map((node) => absolutePosition(node, byId).y))
      const generatorId = addNode(
        'imageGenerator',
        { x: right + 90, y: top },
        {
          title: isLight ? t('slash.light.generatorTitle') : t('slash.angle.generatorTitle'),
          prompt: isLight ? t('slash.light.seedPrompt') : t('slash.angle.seedPrompt'),
          ...slashGeneratorData(key),
        },
      )
      images.forEach((image) =>
        onConnect({ source: image.id, target: generatorId, sourceHandle: null, targetHandle: null }),
      )
      const n = slashGeneratorCount(key)
      toast.success(isLight ? t('slash.light.createdFromSelection', { n }) : t('slash.angle.createdFromSelection', { n }))
      focusNode(generatorId)
    },
    [addAt, addNode, focusNode, onConnect, t],
  )

  /** 资产库 / 生成日志里点「+」：在视口中间放一个图片 / 视频节点 */
  const addMedia = useCallback(
    (media: MediaDrop) => {
      const id = addAt(media.kind, undefined, {
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        taskId: media.taskId,
      })
      focusNode(id)
      toast.success(t('library.assets.added'))
    },
    [addAt, focusNode, t],
  )

  /** 把模板铺到视口中间偏左，整段可撤销；返回铺了几个节点 */
  const applyGraph = useCallback(
    (graph: Graph) => {
      if (!graph.nodes?.length) return 0
      const origin = screenToFlowPosition({ x: window.innerWidth / 2 - 260, y: window.innerHeight / 2 - 200 })
      const placed = instantiateGraph(graph, origin, (kind) => nextNodeId(kind as CanvasNodeKind))
      const { nodes: all, edges: allEdges } = useCanvasStore.getState()
      commit({
        nodes: [...all.map((node) => (node.selected ? { ...node, selected: false } : node)), ...placed.nodes],
        edges: [...allEdges, ...placed.edges],
      })
      return placed.nodes.length
    },
    [commit, screenToFlowPosition],
  )

  const getSelection = useCallback(() => {
    const { nodes: all, edges: allEdges } = useCanvasStore.getState()
    return extractSelection(all, allEdges, selectedIds())
  }, [])

  /** 搜索框里能搜到的动作 */
  const searchActions = useMemo<CanvasAction[]>(
    () => [
      { key: 'cascade', label: t('toolbar.cascadeRun'), run: () => void cascade.start() },
      { key: 'tidy', label: t('view.tidy'), run: tidy },
      { key: 'autoGroup', label: t('view.autoGroup'), run: groupByWorkflow },
      { key: 'toggleGroups', label: t('view.toggleAllGroups'), run: toggleGroups },
      { key: 'group', label: t('view.group'), run: groupSelection },
      { key: 'ungroup', label: t('view.ungroup'), run: ungroupSelection },
      { key: 'exportPng', label: t('toolbar.exportPng'), run: () => void exportPng() },
    ],
    [cascade, exportPng, groupByWorkflow, groupSelection, t, tidy, toggleGroups, ungroupSelection],
  )

  // 快捷键：删除选中、撤销、重做、复制、成组 / 解组、搜索
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // 在输入框里按 Delete 是删字，不是删节点
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (target?.isContentEditable) return

      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        duplicateNodes(selectedIds())
        return
      }
      if (mod && key === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (mod && key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = selectedIds()
        if (selected.length === 0) return
        event.preventDefault()
        removeNodes(selected)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [duplicateNodes, groupSelection, redo, removeNodes, undo, ungroupSelection])

  const handleImport = async (file: File) => {
    const raw = await readFileAsText(file).catch(() => null)
    if (raw === null) {
      toast.error(t('errors.readFileFailed'))
      return
    }
    const result = parseProjectFile(raw)
    if (!result.ok) {
      // parseProjectFile 只给错误码，文案在这里按当前语言拼
      toast.error(t(`errors.file.${result.code}`, { version: result.version, max: result.max }))
      return
    }
    loadProject(result.file, importModeRef.current)
    toast.success(importModeRef.current === 'merge' ? t('messages.merged') : t('messages.imported'))
  }

  return (
    <div className="cv2-root" data-canvas-v2-root>
      <aside className="cv2-sidebar">
        <div className="cv2-sidebar-tabs" role="tablist">
          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={sidebarTab === tab}
              className={sidebarTab === tab ? 'cv2-sidebar-tab cv2-sidebar-tab-active' : 'cv2-sidebar-tab'}
              onClick={() => setSidebarTab(tab)}
            >
              {t(`sidebar.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {sidebarTab === 'assistant' ? (
          <AssistantPanel />
        ) : sidebarTab === 'library' ? (
          <LibraryPanel onAddMedia={addMedia} onApplyGraph={applyGraph} getSelection={getSelection} />
        ) : sidebarTab === 'versions' ? (
          <VersionsPanel boardId={boardId} />
        ) : (
          <>
        <div className="cv2-sidebar-section">
          <span className="cv2-kicker">{t('sidebar.newNode')}</span>
          {NODE_GROUPS.map((group) => (
            <div key={group.key} className="cv2-field">
              <span className="cv2-field-label">{t(`groups.${group.key}`)}</span>
              <div className="cv2-chips">
                {group.kinds.map((kind) => (
                  <button key={kind} type="button" className="cv2-chip" onClick={() => addAt(kind)}>
                    {t(`nodeKinds.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="cv2-sidebar-section">
          <span className="cv2-kicker">{t('sidebar.presets')}</span>
          {CANVAS_PRESETS.map((preset) => (
            <button key={preset.key} type="button" className="cv2-preset" onClick={() => applyPreset(preset)}>
              <span className="cv2-preset-name">{t(`presets.${preset.key}.name`)}</span>
              <span className="cv2-preset-desc">{t(`presets.${preset.key}.description`)}</span>
            </button>
          ))}
        </div>
          </>
        )}
      </aside>

      <div className="cv2-board">
        <header className="cv2-toolbar">
          <button type="button" className="cv2-tool" onClick={undo} title={t('toolbar.undo')}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" className="cv2-tool" onClick={redo} title={t('toolbar.redo')}>
            <Redo2 className="h-4 w-4" />
          </button>
          <span className="cv2-toolbar-divider" />
          <button
            type="button"
            className={mode === 'pan' ? 'cv2-tool cv2-tool-active' : 'cv2-tool'}
            aria-pressed={mode === 'pan'}
            title={t('toolbar.panMode')}
            onClick={() => setMode('pan')}
          >
            <Hand className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={mode === 'select' ? 'cv2-tool cv2-tool-active' : 'cv2-tool'}
            aria-pressed={mode === 'select'}
            title={t('toolbar.selectMode')}
            onClick={() => setMode('select')}
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
          <span className="cv2-toolbar-divider" />
          {cascade.progress ? (
            <button
              type="button"
              className="cv2-tool-wide cv2-tool-danger"
              title={t('toolbar.cascadeCancelTitle')}
              onClick={cascade.cancel}
            >
              <Square className="h-3.5 w-3.5" />
              {t('toolbar.cascadeCancel')}
            </button>
          ) : (
            <button
              type="button"
              className="cv2-tool-wide"
              title={t('toolbar.cascadeRunTitle')}
              onClick={() => void cascade.start()}
            >
              <Play className="h-3.5 w-3.5" />
              {t('toolbar.cascadeRun')}
            </button>
          )}
          <div className="cv2-menu-anchor" ref={viewMenuRef}>
            <button
              type="button"
              className={viewMenuOpen ? 'cv2-tool cv2-tool-active' : 'cv2-tool'}
              title={t('toolbar.view')}
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((open) => !open)}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            {viewMenuOpen && (
              <div className="cv2-menu" role="menu">
                {[
                  { label: t('view.tidy'), run: tidy },
                  { label: t('view.autoGroup'), run: groupByWorkflow },
                  { label: t('view.toggleAllGroups'), run: toggleGroups },
                  { label: t('view.group'), run: groupSelection, shortcut: '⌘G' },
                  { label: t('view.ungroup'), run: ungroupSelection, shortcut: '⇧⌘G' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setViewMenuOpen(false)
                      item.run()
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <kbd className="cv2-kbd">{item.shortcut}</kbd>}
                  </button>
                ))}
                <span className="cv2-menu-divider" />
                {(
                  [
                    ['snapToGrid', t('view.snapToGrid')],
                    ['alignGuides', t('view.alignGuides')],
                    ['minimap', t('view.minimap')],
                  ] as [keyof ViewPrefs, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={prefs[key]}
                    onClick={() => togglePref(key)}
                  >
                    <span>{label}</span>
                    <span className={prefs[key] ? 'cv2-check cv2-check-on' : 'cv2-check'} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="cv2-toolbar-divider" />
          <button
            type="button"
            className="cv2-tool"
            title={t('toolbar.export')}
            onClick={() => {
              downloadProjectFile(toProjectFile(t('toolbar.exportName')), `molagg-canvas-${Date.now()}.json`)
              toast.success(t('messages.exported'))
            }}
          >
            <Download className="h-4 w-4" />
          </button>
          <button type="button" className="cv2-tool" title={t('toolbar.exportPng')} onClick={() => void exportPng()}>
            <ImageDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cv2-tool"
            title={t('toolbar.import')}
            onClick={() => {
              importModeRef.current = 'replace'
              fileInputRef.current?.click()
            }}
          >
            <Upload className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cv2-tool"
            title={t('toolbar.merge')}
            onClick={() => {
              importModeRef.current = 'merge'
              fileInputRef.current?.click()
            }}
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <span className="cv2-toolbar-divider" />
          <button
            type="button"
            className="cv2-tool cv2-tool-danger"
            title={t('toolbar.clear')}
            onClick={() => {
              if (useCanvasStore.getState().nodes.length === 0) return
              if (!window.confirm(t('messages.clearConfirm'))) return
              clear()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <CanvasSearch inputRef={searchRef} actions={searchActions} onPickNode={focusNode} onSlash={runSlash} />
          <SaveIndicator state={saveState} />
          <span className="cv2-toolbar-status">
            {cascade.progress
              ? t('toolbar.cascadeProgress', { batch: cascade.progress.batch, total: cascade.progress.total })
              : t('toolbar.status', { nodes: nodes.length, edges: edges.length })}
          </span>
        </header>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={() => setGuides(null)}
          minZoom={0.1}
          maxZoom={2.5}
          fitView
          proOptions={{ hideAttribution: false }}
          // 移动模式：左键拖动平移，按住 Shift/Ctrl 临时框选；框选模式：左键拖动框选，中键或按住空格平移
          panOnDrag={mode === 'pan' ? true : [1]}
          selectionOnDrag={mode === 'select'}
          selectionKeyCode={mode === 'pan' ? ['Shift', 'Control'] : null}
          panActivationKeyCode="Space"
          snapToGrid={prefs.snapToGrid}
          snapGrid={[GRID, GRID]}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement
            if (!target.classList.contains('react-flow__pane')) return
            addAt('text', { x: event.clientX, y: event.clientY })
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault()
            setMenu({ x: event.clientX, y: event.clientY })
          }}
          onPaneClick={() => setMenu(null)}
          onMoveStart={() => setMenu(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} />
          <Controls showInteractive={false} />
          {prefs.minimap && <MiniMap pannable zoomable ariaLabel={t('flow.minimapAria')} />}
          <AlignGuideLines guides={guides} />
        </ReactFlow>

        {menu && (
          <div className="cv2-context-menu" style={{ left: menu.x, top: menu.y }}>
            {NODE_GROUPS.flatMap((group) => group.kinds).map((kind) => (
              <button key={kind} type="button" onClick={() => addAt(kind, { x: menu.x, y: menu.y })}>
                {t(`nodeKinds.${kind}`)}
              </button>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            // 清空 value，否则连续导入同一个文件不会再触发 change
            event.target.value = ''
            if (file) void handleImport(file)
          }}
        />
      </div>
    </div>
  )
}

export function CanvasV2Content() {
  // 跟创作页、任务队列一套工作台皮肤；深浅跟随站点主题（默认跟随系统）
  useStudioBodySkin()

  return (
    <PageTransition>
      <ReactFlowProvider>
        <NodeRunProvider>
          <CanvasBoard />
        </NodeRunProvider>
      </ReactFlowProvider>
    </PageTransition>
  )
}
