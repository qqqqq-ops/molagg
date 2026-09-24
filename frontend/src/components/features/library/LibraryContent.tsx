'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Check, Download, FileText, Folder, FolderOpen, Inbox, Plus, Search, Trash2, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

import { useTranslations } from '@/i18n/client'
import { PageTransition } from '@/components/shared/PageTransition'
import { imageService, videoService } from '@/lib/api/services'
import { projectsService } from '@/lib/api/services/projects'
import { tasksService } from '@/lib/api/services/tasks'
import type { ApiTask } from '@/lib/api/types'
import type { ProjectAsset, ProjectAssetKind, ProjectSummary } from '@/lib/api/types/projects'
import Link from '@/lib/compat/link'
import { useRouter } from '@/lib/router'
import { cn } from '@/lib/utils/cn'
import { buildRemixHref } from '@/lib/utils/remix'

/**
 * 资产库：原「我的作品」+「项目」合并，并按参考站「资产中心」的思路加入素材管理。
 * 项目 = 文件夹；作品 = 生成完成的任务；素材 = 项目里上传或导入的文件（创作页「项目素材」可直接选用）。
 * 项目的灵感 / 提示词 / 分镜等深度功能仍在 /projects/:id，文件夹上有入口。
 */

type FolderKey = 'all' | 'none' | string
type LibraryTab = 'works' | 'assets'
type TypeFilter = 'all' | ProjectAssetKind

const WORKS_PAGE_SIZE = 24

type SelectedItem = { key: string; kind: 'work' | 'asset'; task?: ApiTask; asset?: ProjectAsset }

function workKey(task: ApiTask) {
  return `work:${task.type}:${task.id}`
}

function assetKey(asset: ProjectAsset) {
  return `asset:${asset.projectId}:${asset.id}`
}

function kindFromMime(file: File): ProjectAssetKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

export function LibraryContent({ locale }: { locale: string }) {
  const t = useTranslations('gallery.library')
  const router = useRouter()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [folder, setFolder] = useState<FolderKey>('all')
  const [tab, setTab] = useState<LibraryTab>('works')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [works, setWorks] = useState<ApiTask[]>([])
  const [worksPage, setWorksPage] = useState(1)
  const [worksHasMore, setWorksHasMore] = useState(false)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map())
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await projectsService.getProjects())
    } catch {
      setProjects([])
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  // 切文件夹 / 标签 / 筛选时清空选择，避免对看不见的东西批量操作
  useEffect(() => {
    setSelected(new Map())
  }, [folder, tab, typeFilter, debouncedSearch])

  // 作品：服务端按项目、类型、关键字筛选，分页加载
  const fetchWorks = useCallback(
    async (page: number) => {
      const result = await tasksService.getFeed({
        page,
        limit: WORKS_PAGE_SIZE,
        status: 'completed',
        projectId: folder === 'all' ? undefined : folder,
        type: typeFilter === 'image' || typeFilter === 'video' ? typeFilter : undefined,
        q: debouncedSearch || undefined,
      })
      return result
    },
    [folder, typeFilter, debouncedSearch],
  )

  // 只有「素材 · 全部」要按项目列表去拉；作品标签不该因为项目列表刷新而重拉
  const assetProjectIds = useMemo(() => {
    if (tab !== 'assets' || folder === 'none') return ''
    return folder === 'all' ? projects.map((project) => project.id).join(',') : folder
  }, [tab, folder, projects])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    const run = async () => {
      if (tab === 'works') {
        const result = await fetchWorks(1)
        if (cancelled) return
        setWorks(result.data)
        setWorksPage(1)
        setWorksHasMore(Boolean(result.pagination?.hasMore))
        return
      }

      // 素材都挂在项目下：「全部」= 各项目素材合并，「未归入项目」没有素材
      if (folder === 'none') {
        setAssets([])
        return
      }
      const projectIds = assetProjectIds ? assetProjectIds.split(',') : []
      const lists = await Promise.all(projectIds.map((id) => projectsService.getProjectAssets(id).catch(() => [])))
      if (cancelled) return
      setAssets(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    }

    run()
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tab, folder, fetchWorks, assetProjectIds, reloadToken])

  const visibleAssets = useMemo(() => {
    const keyword = debouncedSearch.toLowerCase()
    return assets.filter((asset) => {
      if (typeFilter !== 'all' && asset.kind !== typeFilter) return false
      if (!keyword) return true
      return `${asset.title} ${asset.fileName ?? ''} ${asset.sourcePrompt ?? ''}`.toLowerCase().includes(keyword)
    })
  }, [assets, typeFilter, debouncedSearch])

  const loadMoreWorks = async () => {
    try {
      const next = worksPage + 1
      const result = await fetchWorks(next)
      setWorks((prev) => [...prev, ...result.data])
      setWorksPage(next)
      setWorksHasMore(Boolean(result.pagination?.hasMore))
    } catch {
      toast.error(t('loadFailed'))
    }
  }

  const toggleSelect = (item: SelectedItem) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(item.key)) next.delete(item.key)
      else next.set(item.key, item)
      return next
    })
  }

  const createProject = async () => {
    const name = newProjectName.trim()
    if (!name) return
    try {
      const created = await projectsService.createProject({ name })
      setNewProjectName('')
      setCreatingProject(false)
      await loadProjects()
      setFolder(created.id)
    } catch {
      toast.error(t('createProjectFailed'))
    }
  }

  /** 上传目标：当前是项目文件夹就放进去；否则放进「默认文件夹」项目，没有就建一个 */
  const resolveUploadProject = async () => {
    if (folder !== 'all' && folder !== 'none') return folder
    const defaultName = t('defaultFolder')
    const existing = projects.find((project) => project.name === defaultName)
    if (existing) return existing.id
    const created = await projectsService.createProject({ name: defaultName })
    await loadProjects()
    return created.id
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    setUploading(true)
    try {
      const projectId = await resolveUploadProject()
      const groups = new Map<ProjectAssetKind, File[]>()
      files.forEach((file) => {
        const kind = kindFromMime(file)
        groups.set(kind, [...(groups.get(kind) ?? []), file])
      })
      let count = 0
      for (const [kind, group] of groups) {
        const result = await projectsService.uploadProjectAssets(projectId, kind, group)
        count += result.assets.length
      }
      toast.success(t('uploaded', { count }))
      setTab('assets')
      if (folder === 'all' || folder === 'none') setFolder(projectId)
      await loadProjects()
      setReloadToken((token) => token + 1)
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const selectedItems = Array.from(selected.values())

  const addSelectedToProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    const items = selectedItems
      .filter((item) => item.task)
      .map((item) => ({ id: item.task!.id, type: item.task!.type }))
    if (!project || items.length === 0) return
    try {
      const result = await projectsService.importProjectAssets(projectId, { items })
      toast.success(t('added', { name: project.name, count: result.importedCount }))
      setSelected(new Map())
      await loadProjects()
    } catch {
      toast.error(t('loadFailed'))
    }
  }

  const downloadSelected = () => {
    selectedItems.forEach((item) => {
      const url = item.task?.resultUrl || item.asset?.url
      if (!url) return
      const link = document.createElement('a')
      link.href = url
      link.download = ''
      link.target = '_blank'
      link.rel = 'noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    })
  }

  const deleteSelected = async () => {
    if (selectedItems.length === 0) return
    if (!window.confirm(t('deleteConfirm', { count: selectedItems.length }))) return

    const results = await Promise.allSettled(
      selectedItems.map((item) => {
        if (item.task) {
          return item.task.type === 'video'
            ? videoService.deleteTask(item.task.id)
            : imageService.deleteTask(item.task.id)
        }
        return projectsService.deleteProjectAsset(item.asset!.projectId, item.asset!.id)
      }),
    )
    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed > 0) toast.error(t('deleteFailed'))
    else toast.success(t('deleted', { count: selectedItems.length }))
    setSelected(new Map())
    await loadProjects()
    setReloadToken((token) => token + 1)
  }

  const currentProject = projects.find((project) => project.id === folder)
  const typeOptions: TypeFilter[] = tab === 'works' ? ['all', 'image', 'video'] : ['all', 'image', 'video', 'document']
  const typeLabel: Record<TypeFilter, string> = {
    all: t('typeAll'),
    image: t('typeImage'),
    video: t('typeVideo'),
    document: t('typeDocument'),
  }

  const folderButton = (key: FolderKey, label: string, icon: ReactNode, count?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFolder(key)}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        folder === key
          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? <span className="text-xs opacity-60">{count}</span> : null}
    </button>
  )

  const renderSelectBox = (checked: boolean, onToggle: () => void) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={checked}
      className={cn(
        'absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border transition-opacity',
        checked
          ? 'border-aurora-purple bg-aurora-purple text-white opacity-100'
          : 'border-white/70 bg-black/30 text-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100',
      )}
    >
      <Check className="h-4 w-4" />
    </button>
  )

  const renderWorks = () => {
    if (works.length === 0) {
      return (
        <EmptyBlock title={t('emptyWorks')} hint={t('emptyWorksHint')}>
          <Link
            href={`/${locale}/create`}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
          >
            {t('goCreate')}
          </Link>
        </EmptyBlock>
      )
    }

    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {works.map((task) => {
            const key = workKey(task)
            const checked = selected.has(key)
            const src = task.thumbnailUrl || task.resultUrl || ''
            return (
              <article
                key={key}
                className={cn(
                  'group relative overflow-hidden rounded-[20px] border bg-stone-100 dark:bg-stone-900',
                  checked ? 'border-aurora-purple ring-2 ring-aurora-purple/40' : 'border-stone-200 dark:border-stone-800',
                )}
                // aspect-square 会被 aspect-ratio 插件顶掉，用内联
                style={{ aspectRatio: '1 / 1' }}
              >
                {renderSelectBox(checked, () => toggleSelect({ key, kind: 'work', task }))}
                {task.type === 'video' && !task.thumbnailUrl && task.resultUrl ? (
                  <video src={task.resultUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : src ? (
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : null}
                {task.type === 'video' ? (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {t('typeVideo')}
                  </span>
                ) : null}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-3 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  {task.prompt ? <p className="line-clamp-2 text-xs leading-5 text-white/85">{task.prompt}</p> : null}
                  <button
                    type="button"
                    onClick={() => router.push(buildRemixHref(locale, task))}
                    className="pointer-events-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-stone-900 shadow-lg hover:bg-white"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {t('remix')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {worksHasMore ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMoreWorks()}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              {t('loadMore')}
            </button>
          </div>
        ) : null}
      </>
    )
  }

  const renderAssets = () => {
    if (visibleAssets.length === 0) {
      return (
        <EmptyBlock
          title={t('emptyAssets')}
          hint={folder === 'none' ? t('unassignedAssetsHint') : t('emptyAssetsHint')}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
          >
            <Upload className="h-4 w-4" />
            {t('upload')}
          </button>
        </EmptyBlock>
      )
    }

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {visibleAssets.map((asset) => {
          const key = assetKey(asset)
          const checked = selected.has(key)
          const project = folder === 'all' ? projects.find((item) => item.id === asset.projectId) : null
          return (
            <article
              key={key}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-[20px] border bg-white dark:bg-stone-900',
                checked ? 'border-aurora-purple ring-2 ring-aurora-purple/40' : 'border-stone-200 dark:border-stone-800',
              )}
            >
              {renderSelectBox(checked, () => toggleSelect({ key, kind: 'asset', asset }))}
              <div className="relative bg-stone-100 dark:bg-stone-950" style={{ aspectRatio: '1 / 1' }}>
                {asset.kind === 'image' ? (
                  <img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : asset.kind === 'video' ? (
                  <video
                    src={asset.url}
                    poster={asset.thumbnailUrl || undefined}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-stone-400">
                    <FileText className="h-10 w-10" />
                  </div>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                  {typeLabel[asset.kind]}
                </span>
              </div>
              <div className="min-w-0 px-3 py-2">
                <p className="truncate text-xs font-medium text-stone-800 dark:text-stone-100">
                  {asset.title || asset.fileName}
                </p>
                {project ? <p className="truncate text-[11px] text-stone-400">{project.name}</p> : null}
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <PageTransition className="mx-auto w-full max-w-[1680px] px-4 py-5 pb-28 sm:px-6 md:pb-8 lg:px-8">
      <header className="mb-5 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white">{t('title')}</h1>
        <p className="max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* 文件夹栏 */}
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[24px] border border-stone-200/80 bg-white/90 p-3 dark:border-stone-700 dark:bg-stone-900/90">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-400">{t('folders')}</p>
            <div className="flex gap-1 overflow-x-auto lg:flex-col">
              {folderButton('all', t('all'), <Inbox className="h-4 w-4 shrink-0" />)}
              {folderButton('none', t('unassigned'), <Folder className="h-4 w-4 shrink-0" />)}
            </div>
            <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {t('projectsHeading')}
            </p>
            <div className="flex gap-1 overflow-x-auto lg:max-h-[50vh] lg:flex-col lg:overflow-y-auto">
              {projects.map((project) =>
                folderButton(
                  project.id,
                  project.name,
                  folder === project.id ? (
                    <FolderOpen className="h-4 w-4 shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0" />
                  ),
                  project.assetCount,
                ),
              )}
            </div>
            {creatingProject ? (
              <input
                autoFocus
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createProject()
                  if (event.key === 'Escape') setCreatingProject(false)
                }}
                onBlur={() => {
                  if (!newProjectName.trim()) setCreatingProject(false)
                }}
                placeholder={t('newProjectPlaceholder')}
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-aurora-purple dark:border-stone-600 dark:bg-stone-950"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreatingProject(true)}
                className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              >
                <Plus className="h-4 w-4" />
                {t('newProject')}
              </button>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-aurora-purple to-aurora-pink px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {uploading ? t('uploading') : t('upload')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md"
              hidden
              onChange={(event) => void handleUpload(event)}
            />
          </div>
        </aside>

        {/* 内容区 */}
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-900">
              {(['works', 'assets'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key)
                    if (key === 'works' && typeFilter === 'document') setTypeFilter('all')
                  }}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                    tab === key
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
                  )}
                >
                  {key === 'works' ? t('tabWorks') : t('tabAssets')}
                </button>
              ))}
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {typeLabel[option]}
                </option>
              ))}
            </select>

            <label className="relative min-w-[200px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search')}
                className="w-full rounded-full border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-900"
              />
            </label>

            {currentProject ? (
              <Link
                href={`/${locale}/projects/${currentProject.id}`}
                className="ml-auto text-sm font-medium text-aurora-purple hover:opacity-80"
              >
                {t('projectDetail')} →
              </Link>
            ) : null}
          </div>

          {selectedItems.length > 0 ? (
            <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/95 px-4 py-2.5 shadow-lg dark:border-stone-700 dark:bg-stone-900/95">
              <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                {t('selected', { count: selectedItems.length })}
              </span>
              {tab === 'works' && projects.length > 0 ? (
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) void addSelectedToProject(event.target.value)
                  }}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
                >
                  <option value="">{t('addToProject')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={downloadSelected}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-sm hover:border-stone-300 dark:border-stone-700"
              >
                <Download className="h-4 w-4" />
                {t('download')}
              </button>
              <button
                type="button"
                onClick={() => void deleteSelected()}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:border-red-300 dark:border-red-500/40 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                {t('delete')}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="ml-auto text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
              >
                {t('clearSelection')}
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-[20px] bg-stone-100 dark:bg-stone-800"
                  style={{ aspectRatio: '1 / 1' }}
                />
              ))}
            </div>
          ) : loadError ? (
            <EmptyBlock title={t('loadFailed')} hint="">
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
              >
                {t('retry')}
              </button>
            </EmptyBlock>
          ) : tab === 'works' ? (
            renderWorks()
          ) : (
            renderAssets()
          )}
        </section>
      </div>
    </PageTransition>
  )
}

function EmptyBlock({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center dark:border-stone-700 dark:bg-stone-900/60">
      <p className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</p>
      {hint ? <p className="max-w-md text-sm leading-6 text-stone-500 dark:text-stone-400">{hint}</p> : null}
      {children}
    </div>
  )
}
