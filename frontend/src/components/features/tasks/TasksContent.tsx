/**
 * 任务队列「我的创作空间」—— 照 creative-studio/tasks：
 * 统计卡 → 标签（当前 / 全部 / 成功 / 失败）→ 工具栏（搜索、类型、项目、新建）→ 列表行 → 详情抽屉。
 * 和创作页一样固定深色工作台（用户拍板）。
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import { useRouter } from '@/lib/router'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { Loading } from '@/components/ui'
import { imageService, projectsService, tasksService, videoService } from '@/lib/api/services'
import type { TaskStats } from '@/lib/api/services/tasks'
import type { ProjectSummary } from '@/lib/api/types/projects'
import { useAuth } from '@/lib/hooks/useAuth'
import { useStudioBodySkin } from '@/lib/hooks/useStudioBodySkin'
import {
  getTasksViewCache,
  removeTaskFromTasksViewCache,
  setTasksViewCache,
  upsertTaskInTasksViewCache,
} from '@/lib/cache/viewCache'
import { buildRemixHref } from '@/lib/utils/remix'
import type { ApiTask } from '@/lib/api/types/task'
import { PageTransition } from '@/components/shared/PageTransition'
import { TaskQueueRow } from './TaskQueueRow'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { isTaskActive, taskKey } from './taskQueueUtils'

type QueueTab = 'active' | 'all' | 'completed' | 'failed'
type TypeFilter = 'all' | 'image' | 'video'

const TABS: QueueTab[] = ['active', 'all', 'completed', 'failed']
const STAT_CARDS: Array<{ key: keyof TaskStats; tab: QueueTab }> = [
  { key: 'active', tab: 'active' },
  { key: 'completed', tab: 'completed' },
  { key: 'failed', tab: 'failed' },
  { key: 'total', tab: 'all' },
]
const PAGE_SIZE = 20
const POLL_INTERVAL_MS = 5000
/** 一次轮询最多查这么多个进行中的任务，防止列表很长时一轮打几十个请求 */
const POLL_MAX_TASKS = 12
const TASKS_CACHE_MAX_AGE_MS = 5 * 60 * 1000

function sortTasksByCreatedAtDesc(items: ApiTask[]) {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

function appendTasksStable(prev: ApiTask[], incoming: ApiTask[]) {
  const existingKeys = new Set(prev.map(taskKey))
  const dedupedIncoming = incoming.filter((task) => {
    const key = taskKey(task)
    if (existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })
  return [...prev, ...dedupedIncoming]
}

export function TasksContent() {
  const t = useTranslations('tasks')
  const locale = useLocale()
  const router = useRouter()
  const { user, isReady } = useAuth()
  const userId = user?.id ?? null

  useStudioBodySkin()

  const [tab, setTab] = useState<QueueTab>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [projectFilter, setProjectFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const tasksRef = useRef<ApiTask[]>([])
  tasksRef.current = tasks
  /** 每次换筛选都 +1；旧请求回来时对不上就丢掉，避免快速切换时列表被旧结果覆盖 */
  const requestSeqRef = useRef(0)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  // 没加任何筛选的「全部」才读写视图缓存（缓存里存的就是这个视图，创作页提交后也会往里 upsert）
  const isDefaultView = tab === 'all' && typeFilter === 'all' && !projectFilter && !keyword
  const hasFilters = typeFilter !== 'all' || Boolean(projectFilter) || Boolean(keyword)

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])
  const getProjectName = useCallback(
    (task: ApiTask) => (task.projectId ? projectNames.get(String(task.projectId)) ?? null : null),
    [projectNames],
  )

  // 搜索框防抖
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadStats = useCallback(async () => {
    try {
      setStats(await tasksService.getStats())
    } catch (err) {
      console.error('[TasksContent] Failed to load stats:', err)
    }
  }, [])

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const seq = append ? requestSeqRef.current : ++requestSeqRef.current
      if (append) setIsLoadingMore(true)

      try {
        const result = await tasksService.getFeed({
          page: pageNum,
          limit: PAGE_SIZE,
          status: tab === 'all' ? undefined : tab,
          type: typeFilter === 'all' ? undefined : typeFilter,
          projectId: projectFilter || undefined,
          q: keyword || undefined,
        })
        if (seq !== requestSeqRef.current) return

        const incoming = sortTasksByCreatedAtDesc(result.data || [])
        const nextTasks = append ? appendTasksStable(tasksRef.current, incoming) : incoming
        const nextHasMore = Boolean(result.pagination.hasMore)
        setTasks(nextTasks)
        setPage(pageNum)
        setHasMore(nextHasMore)
        setError(null)
        if (isDefaultView) {
          setTasksViewCache(userId, { tasks: nextTasks, page: pageNum, hasMore: nextHasMore })
        }
      } catch (err) {
        if (seq !== requestSeqRef.current) return
        console.error('[TasksContent] Failed to load tasks:', err)
        if (!append) setError(t('errors.load'))
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [isDefaultView, keyword, projectFilter, t, tab, typeFilter, userId],
  )

  // 首次进入 + 每次换筛选：从第 1 页重新拉
  useEffect(() => {
    if (!isReady) return

    const cached = isDefaultView ? getTasksViewCache(userId, TASKS_CACHE_MAX_AGE_MS) : null
    if (cached && cached.tasks.length > 0) {
      setTasks(cached.tasks)
      setPage(cached.page)
      setHasMore(cached.hasMore)
      setIsLoading(false)
    } else {
      setTasks([])
      setIsLoading(true)
    }
    void loadPage(1, false)
  }, [isDefaultView, isReady, loadPage, userId])

  useEffect(() => {
    if (!isReady) return
    void loadStats()
    projectsService
      .getProjects()
      .then(setProjects)
      .catch((err) => console.error('[TasksContent] Failed to load projects:', err))
  }, [isReady, loadStats])

  const applyTaskUpdate = useCallback(
    (nextTask: ApiTask) => {
      const key = taskKey(nextTask)
      setTasks((prev) => {
        const exists = prev.some((item) => taskKey(item) === key)
        // 重试 / MJ 操作可能生成新任务：插到最前面；原有任务原地更新，不打乱滚动位置
        return exists
          ? prev.map((item) => (taskKey(item) === key ? nextTask : item))
          : sortTasksByCreatedAtDesc([nextTask, ...prev])
      })
      upsertTaskInTasksViewCache(userId, nextTask)
    },
    [userId],
  )

  const removeTask = useCallback(
    (task: ApiTask) => {
      setTasks((prev) => prev.filter((item) => taskKey(item) !== taskKey(task)))
      removeTaskFromTasksViewCache(userId, task.type, task.id)
      setSelectedKey((current) => (current === taskKey(task) ? null : current))
      void loadStats()
    },
    [loadStats, userId],
  )

  // 只轮询列表里进行中的那几条（不整页重拉，否则翻到第 3 页的内容会被第 1 页替换掉）
  const hasActiveTasks = tasks.some(isTaskActive)
  useEffect(() => {
    if (!hasActiveTasks) return

    let cancelled = false
    const tick = async () => {
      const active = tasksRef.current.filter(isTaskActive).slice(0, POLL_MAX_TASKS)
      const results = await Promise.allSettled(
        active.map((task) => (task.type === 'image' ? imageService.getTask(task.id) : videoService.getTask(task.id))),
      )
      if (cancelled) return

      let statusChanged = false
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        if (result.value.status !== active[index].status) statusChanged = true
        applyTaskUpdate(result.value)
      })
      if (statusChanged) void loadStats()
    }

    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [applyTaskUpdate, hasActiveTasks, loadStats])

  // 底部哨兵触发加载更多
  useEffect(() => {
    if (!hasMore || isLoading) return
    const sentinel = loadMoreRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (isLoadingMore) return
        void loadPage(page + 1, true)
      },
      { root: null, rootMargin: '480px 0px', threshold: 0.01 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, isLoadingMore, loadPage, page])

  const selectedTask = selectedKey ? tasks.find((task) => taskKey(task) === selectedKey) ?? null : null
  const closeDrawer = useCallback(() => setSelectedKey(null), [])
  const remix = (task: ApiTask) => router.push(buildRemixHref(locale, task))
  const clearFilters = () => {
    setTypeFilter('all')
    setProjectFilter('')
    setSearchInput('')
    setKeyword('')
  }

  return (
    <div className="dark studio-skin min-h-screen w-full">
      <PageTransition className="task-queue mx-auto w-full max-w-[1560px] px-4 py-6 pb-24 sm:px-6 md:pb-12 lg:px-8">
        <section className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <span className="studio-kicker">{t('queue.kicker')}</span>
            <h1 className="studio-display mt-2 text-4xl md:text-5xl">{t('queue.title')}</h1>
            <p className="task-queue-muted mt-3 text-sm">{t('queue.subtitle')}</p>
          </div>
        </section>

        {/* 统计卡：点一下切到对应标签 */}
        <section className="task-stats mb-6">
          {STAT_CARDS.map(({ key, tab: targetTab }) => (
            <button
              key={key}
              type="button"
              className="task-stat"
              data-kind={key}
              data-active={tab === targetTab}
              onClick={() => setTab(targetTab)}
            >
              <span>{t(`queue.stats.${key}`)}</span>
              <strong>{stats ? stats[key] : '—'}</strong>
            </button>
          ))}
        </section>

        <section className="studio-workspace">
          <div className="task-toolbar">
            <div className="task-tabs" role="tablist">
              {TABS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  data-active={tab === item}
                  className="task-tab"
                  onClick={() => setTab(item)}
                >
                  {t(`queue.tabs.${item}`)}
                  {item === 'active' && stats && stats.active > 0 && <span className="task-tab-count">{stats.active}</span>}
                </button>
              ))}
            </div>

            <div className="task-filters">
              <label className="task-search">
                <Search className="h-3.5 w-3.5" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t('queue.search')}
                />
              </label>
              <select
                className="task-select"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                aria-label={t('drawer.type')}
              >
                <option value="all">{t('queue.type.all')}</option>
                <option value="image">{t('queue.type.image')}</option>
                <option value="video">{t('queue.type.video')}</option>
              </select>
              <select
                className="task-select"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                aria-label={t('drawer.project')}
              >
                <option value="">{t('queue.project.all')}</option>
                <option value="none">{t('queue.project.none')}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button type="button" className="task-new-button" onClick={() => router.push(`/${locale}/create`)}>
                <Plus className="h-4 w-4" />
                {t('queue.create')}
              </button>
            </div>
          </div>

          <div className="task-list">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loading />
              </div>
            ) : error ? (
              <div className="task-empty">
                <p className="task-row-failure">{error}</p>
                <button type="button" className="studio-outline-button" onClick={() => void loadPage(1, false)}>
                  {t('queue.retry')}
                </button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="task-empty">
                <ClipboardList className="h-7 w-7" />
                <strong>
                  {hasFilters
                    ? t('queue.emptyFiltered.title')
                    : tab === 'active'
                      ? t('queue.emptyActive.title')
                      : t('empty.title')}
                </strong>
                <p>
                  {hasFilters
                    ? t('queue.emptyFiltered.description')
                    : tab === 'active'
                      ? t('queue.emptyActive.description')
                      : t('empty.description')}
                </p>
                {hasFilters ? (
                  <button type="button" className="studio-outline-button" onClick={clearFilters}>
                    {t('queue.clearFilters')}
                  </button>
                ) : (
                  <button type="button" className="task-new-button" onClick={() => router.push(`/${locale}/create`)}>
                    {t('empty.action')}
                  </button>
                )}
              </div>
            ) : (
              <>
                {tasks.map((task) => (
                  <TaskQueueRow
                    key={taskKey(task)}
                    task={task}
                    projectName={getProjectName(task)}
                    onOpen={() => setSelectedKey(taskKey(task))}
                    onRemix={() => remix(task)}
                  />
                ))}
                {isLoadingMore && (
                  <div className="flex justify-center py-6">
                    <Loading />
                  </div>
                )}
                {!hasMore && <p className="task-queue-faint py-6 text-center text-xs">{t('queue.loadedAll')}</p>}
                {hasMore && <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />}
              </>
            )}
          </div>
        </section>
      </PageTransition>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectName={getProjectName(selectedTask)}
          onClose={closeDrawer}
          onRemix={() => remix(selectedTask)}
          onUpdate={(nextTask) => {
            if (nextTask) {
              applyTaskUpdate(nextTask)
              void loadStats()
              return
            }
            const service = selectedTask.type === 'image' ? imageService : videoService
            void service.getTask(selectedTask.id).then(applyTaskUpdate).catch(() => undefined)
          }}
          onDelete={() => removeTask(selectedTask)}
        />
      )}
    </div>
  )
}
