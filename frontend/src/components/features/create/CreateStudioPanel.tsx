'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Clock, Download, ExternalLink, Info, Play, Settings2, XCircle } from 'lucide-react'

import { useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import type { TrackedJob } from '@/lib/hooks/useTrackedTasks'
import { TaskProgress } from '@/components/shared/TaskProgress'
import { cn } from '@/lib/utils/cn'
import { isConfigurationFailure } from '@/lib/utils/failure'

import type { CreateShowcaseCase } from './showcaseCases'

export type StudioSummaryCell = { label: string; value: string; sub: string }

export type StudioSummary = {
  ready: boolean
  statusLabel: string
  cells: StudioSummaryCell[]
  noteTitle: string
  noteText: string
}

type CreateStudioPanelProps = {
  locale: string
  cases: CreateShowcaseCase[]
  onApplyCase: (item: CreateShowcaseCase) => void
  jobs: TrackedJob[]
  onClearJobs: () => void
  onConfigure: () => void
  summary: StudioSummary
  onMoreCases: () => void
}

type Focus = { kind: 'case'; id: string } | { kind: 'job'; key: string }

/**
 * 创作页右半边，排版照搬 creative-studio：
 * 16:9 主预览（案例封面 / 播放样片，或本次生成的结果）→ 本次生成缩略条 → 案例缩略条 → 更多案例 → 当前生成配置。
 * 参考站的报价 / 计费部分不搬：我们是用户自带 key，没有积分体系。
 */
export function CreateStudioPanel({
  locale,
  cases,
  onApplyCase,
  jobs,
  onClearJobs,
  onConfigure,
  summary,
  onMoreCases,
}: CreateStudioPanelProps) {
  const t = useTranslations('create.studio')
  const tResults = useTranslations('create.results')
  const tFailure = useTranslations('errors.failure')
  const [focus, setFocus] = useState<Focus | null>(null)
  const [playing, setPlaying] = useState(false)

  // 有新提交时主预览自动切到最新那一个
  const latestJobKey = jobs[0]?.key
  useEffect(() => {
    if (latestJobKey) setFocus({ kind: 'job', key: latestJobKey })
  }, [latestJobKey])

  // 切图片/视频后案例列表换了，焦点回到第一个案例
  const firstCaseId = cases[0]?.id
  useEffect(() => {
    setFocus((current) => (current?.kind === 'job' ? current : firstCaseId ? { kind: 'case', id: firstCaseId } : null))
    setPlaying(false)
  }, [firstCaseId])

  const focusedJob = focus?.kind === 'job' ? jobs.find((job) => job.key === focus.key) : undefined
  const focusedCase =
    focus?.kind === 'case' ? cases.find((item) => item.id === focus.id) : focusedJob ? undefined : cases[0]
  const hasFinished = jobs.some((job) => job.status === 'completed' || job.status === 'failed')

  const selectCase = (item: CreateShowcaseCase) => {
    setFocus({ kind: 'case', id: item.id })
    setPlaying(false)
    onApplyCase(item)
  }

  const renderJobStage = (job: TrackedJob) => {
    if (job.status === 'completed' && job.resultUrl) {
      return (
        <>
          {job.mode === 'video' ? (
            <video
              key={job.key}
              src={job.resultUrl}
              poster={job.thumbnailUrl || undefined}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <img src={job.resultUrl} alt="" className="h-full w-full object-contain" />
          )}
          <div className="absolute right-3 top-3 flex gap-1.5">
            <a
              href={job.resultUrl}
              download
              title={tResults('download')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-white/10 bg-black/60 text-white hover:bg-black/75"
            >
              <Download className="h-4 w-4" />
            </a>
            <a
              href={job.resultUrl}
              target="_blank"
              rel="noreferrer"
              title={tResults('open')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-white/10 bg-black/60 text-white hover:bg-black/75"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </>
      )
    }

    if (job.status === 'failed') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <XCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[color:var(--studio-text)]">{tResults('failed')}</p>
          <p className="max-w-md text-xs leading-5 text-[color:var(--studio-muted)]">{tFailure(job.failure?.kind ?? 'unknown')}</p>
          {job.failure?.detail ? (
            <p className="max-w-md break-all text-[11px] leading-5 text-[color:var(--studio-faint)]">
              {tFailure('detail', { detail: job.failure.detail })}
            </p>
          ) : null}
          {job.failure && isConfigurationFailure(job.failure.kind) ? (
            <button
              type="button"
              onClick={onConfigure}
              className="mt-1 inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--studio-gold)] px-3 py-1.5 text-xs font-medium text-[color:var(--studio-gold)] hover:bg-[color:var(--studio-gold-soft)]"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {tFailure('channelMissingAction')}
            </button>
          ) : null}
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[color:var(--studio-muted)]">
        <Clock className="h-7 w-7 animate-spin text-[color:var(--studio-muted)]" />
        {job.status === 'processing'
          ? tResults('statusRunning')
          : job.status === 'submitting'
            ? tResults('statusSubmitting')
            : tResults('statusQueued')}
        <TaskProgress
          className="w-full max-w-sm px-6"
          status={job.status}
          type={job.mode}
          createdAt={job.createdAt}
          progress={job.progress}
          modelId={job.modelId}
        />
      </div>
    )
  }

  const renderCaseStage = (item: CreateShowcaseCase) => {
    if (playing && item.video) {
      return (
        <video
          key={item.id}
          src={item.video}
          poster={item.image}
          controls
          autoPlay
          playsInline
          onEnded={() => setPlaying(false)}
          className="h-full w-full object-contain"
        />
      )
    }

    return (
      <>
        {item.image ? (
          <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          // 还没有样片素材的视频案例：文字海报
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(217,155,69,0.22),transparent_60%),radial-gradient(circle_at_80%_90%,rgba(147,153,151,0.14),transparent_55%)] px-10">
            <p className="line-clamp-4 max-w-xl text-center text-base font-medium leading-8 text-[color:var(--studio-text)] sm:text-lg">
              {item.prompt}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[80%] border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-sm">
          <small className="block text-[10px] font-semibold text-[color:var(--studio-gold)]">
            {t('showcase')} · {item.mode === 'video' ? t('modeVideo') : t('modeImage')}
          </small>
          <strong className="mt-1 block truncate text-sm font-bold text-white">
            {item.title} · {item.tag}
            {item.duration ? ` · ${item.duration}s` : ''}
          </strong>
        </div>
        {item.reference ? (
          // 参考创作：角落里放生成时用的参考图，一眼看出「参考了什么 → 生成了什么」
          <figure className="pointer-events-none absolute bottom-4 left-4 w-[22%] min-w-20 overflow-hidden border border-white/20 bg-black/65 backdrop-blur-sm">
            <img src={item.reference} alt="" className="aspect-[3/2] w-full object-cover" />
            <figcaption className="px-2 py-1 text-[10px] font-semibold text-white/85">{t('referenceImage')}</figcaption>
          </figure>
        ) : null}
        {item.video ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`${t('playSample')}：${item.title}`}
            className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[3px] border border-[color:var(--studio-gold)] bg-black/60 px-4 py-2 text-xs font-semibold text-[color:var(--studio-gold)] backdrop-blur-sm hover:bg-black/75"
          >
            <Play className="h-3 w-3 fill-current" />
            {t('playSample')}
          </button>
        ) : null}
      </>
    )
  }

  return (
    <section className="min-w-0 space-y-3">
      {/* 主预览：16:9 舞台（底色随工作台深浅，见 --studio-stage） */}
      <div
        className="relative w-full overflow-hidden border border-[color:var(--studio-line)] bg-[color:var(--studio-stage)]"
        style={{ aspectRatio: '16 / 9' }}
      >
        {focusedJob ? (
          renderJobStage(focusedJob)
        ) : focusedCase ? (
          renderCaseStage(focusedCase)
        ) : (
          // 这个模式还没有真实生成的示例（参考创作的样片要等能给出公网图片地址后再做）
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-[color:var(--studio-muted)]">
            {t('casesComing')}
          </div>
        )}
      </div>

      {/* 本次生成 */}
      {jobs.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[color:var(--studio-text)]">
              {tResults('title', { count: jobs.length })}
            </span>
            <div className="flex items-center gap-3">
              <Link
                href={`/${locale}/tasks`}
                className="text-[color:var(--studio-muted)] hover:text-[color:var(--studio-text)]"
              >
                {tResults('viewAll')}
              </Link>
              {hasFinished ? (
                <button
                  type="button"
                  onClick={onClearJobs}
                  className="text-[color:var(--studio-muted)] hover:text-[color:var(--studio-text)]"
                >
                  {tResults('clear')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {jobs.slice(0, 12).map((job) => {
              const active = focusedJob?.key === job.key
              return (
                <button
                  key={job.key}
                  type="button"
                  onClick={() => setFocus({ kind: 'job', key: job.key })}
                  className={cn(
                    'relative overflow-hidden border bg-[color:var(--studio-stage)]',
                    active ? 'border-[color:var(--studio-gold)]' : 'border-[color:var(--studio-line)]',
                  )}
                  style={{ aspectRatio: '1 / 1' }}
                >
                  {job.status === 'completed' && (job.thumbnailUrl || (job.mode === 'image' && job.resultUrl)) ? (
                    <img src={job.thumbnailUrl || job.resultUrl || ''} alt="" className="h-full w-full object-cover" />
                  ) : job.status === 'failed' ? (
                    <XCircle className="mx-auto h-5 w-5 text-red-400" />
                  ) : job.status === 'completed' ? (
                    <Play className="mx-auto h-5 w-5 text-[color:var(--studio-muted)]" />
                  ) : (
                    <Clock className="mx-auto h-4 w-4 animate-spin text-[color:var(--studio-muted)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* 案例缩略条 */}
      <div className="grid grid-cols-4 gap-2">
        {cases.map((item, index) => {
          const active = !focusedJob && focusedCase?.id === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectCase(item)}
              aria-label={`${t('applyCase')}：${item.title}`}
              title={item.title}
              className={cn(
                'group relative overflow-hidden border bg-[color:var(--studio-stage)] text-left transition',
                active
                  ? 'border-[color:var(--studio-gold)]'
                  : 'border-[color:var(--studio-line)] hover:border-[color:var(--studio-line-strong)]',
              )}
              style={{ aspectRatio: '16 / 9' }}
            >
              {item.image ? (
                <img src={item.image} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(217,155,69,0.28),transparent_65%)] px-2">
                  <span className="line-clamp-2 text-center text-[11px] font-medium leading-4 text-[color:var(--studio-text)]">
                    {item.title}
                  </span>
                </div>
              )}
              <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow group-hover:text-white">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <span className="absolute bottom-1 right-1.5 text-[10px] font-semibold tabular-nums text-white/90 drop-shadow">
                {String(index + 1).padStart(2, '0')}
              </span>
            </button>
          )
        })}
      </div>

      {cases.length > 0 ? (
      <button
        type="button"
        onClick={onMoreCases}
        className="mx-auto flex items-center gap-1 py-1 text-xs font-medium text-[color:var(--studio-gold)] hover:text-[color:var(--studio-gold-strong)]"
      >
        {t('moreCases')}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      ) : null}

      {/* 当前生成配置 */}
      <section className="border border-[color:var(--studio-line)] bg-[color:var(--studio-card)] p-5">
        <header className="mb-4 flex items-start justify-between gap-3 border-b border-[color:var(--studio-line)] pb-4">
          <div>
            <span className="studio-kicker">{t('currentConfig')}</span>
            <strong
              className={cn(
                'mt-1 block text-lg font-bold',
                summary.ready ? 'text-[color:var(--studio-text)]' : 'text-[color:var(--studio-gold)]',
              )}
            >
              {summary.statusLabel}
            </strong>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {summary.cells.map((cell) => (
            <div
              key={cell.label}
              className="min-w-0 border border-[color:var(--studio-line)] bg-[color:var(--studio-field)] px-3 py-3"
            >
              <span className="block text-[10px] text-[color:var(--studio-faint)]">{cell.label}</span>
              <strong className="mt-1 block truncate text-sm font-bold text-[color:var(--studio-text)]">
                {cell.value}
              </strong>
              <small className="mt-0.5 block truncate text-[10px] text-[color:var(--studio-faint)]">{cell.sub}</small>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2.5 bg-[#17140f] px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-gold)]" />
          <div className="min-w-0">
            <strong className="block text-xs font-bold text-[color:var(--studio-text)]">{summary.noteTitle}</strong>
            <p className="mt-1 text-xs leading-5 text-[color:var(--studio-muted)]">{summary.noteText}</p>
          </div>
        </div>
      </section>
    </section>
  )
}
