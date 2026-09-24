'use client'

import { useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import { isConfigurationFailure } from '@/lib/utils/failure'
import { TaskProgress } from '@/components/shared/TaskProgress'

import type { LandingHomeCopy } from './landingHomePage.shared'
import type { LandingJob } from './useLandingGeneration'
import styles from './LandingHomePage.module.css'

type LandingResultsProps = {
  locale: string
  copy: LandingHomeCopy
  jobs: LandingJob[]
  onClear: () => void
  onConfigure: () => void
}

export function LandingResults({ locale, copy, jobs, onClear, onConfigure }: LandingResultsProps) {
  const tFailure = useTranslations('errors.failure')

  if (jobs.length === 0) return null

  return (
    <section className={styles.resultsPanel} aria-live="polite">
      <div className={styles.resultsGrid}>
        {jobs.map((job) => (
          <article key={job.key} className={styles.resultCard} data-mode={job.mode}>
            {job.status === 'completed' && job.resultUrl && job.mode === 'video' ? (
              // 视频不能包在链接里，否则点播放控件会直接跳走
              <div className={styles.resultMedia}>
                <video src={job.resultUrl} poster={job.thumbnailUrl || undefined} controls playsInline preload="metadata" />
              </div>
            ) : job.status === 'completed' && job.resultUrl ? (
              <a href={job.resultUrl} target="_blank" rel="noreferrer" className={styles.resultMedia} title={copy.openResult}>
                <img src={job.thumbnailUrl || job.resultUrl} alt="" loading="lazy" />
              </a>
            ) : job.status === 'failed' ? (
              <div className={styles.resultFailed}>
                <strong>{copy.statusFailed}</strong>
                <p>{tFailure(job.failure?.kind ?? 'unknown')}</p>
                {job.failure?.detail ? (
                  <p className={styles.resultFailedDetail}>{tFailure('detail', { detail: job.failure.detail })}</p>
                ) : null}
                {job.failure && isConfigurationFailure(job.failure.kind) ? (
                  <button type="button" className={styles.sampleChip} onClick={onConfigure}>
                    {copy.configureChannel}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className={styles.resultPending}>
                <span className={styles.resultSpinner} aria-hidden="true" />
                <span>
                  {job.status === 'processing'
                    ? copy.statusRunning
                    : job.status === 'submitting'
                      ? copy.submitting
                      : copy.statusQueued}
                </span>
                <TaskProgress
                  className={styles.resultProgress}
                  status={job.status}
                  type={job.mode}
                  createdAt={job.createdAt}
                  progress={job.progress}
                  modelId={job.modelId}
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <div className={styles.resultsFooter}>
        <Link href={`/${locale}/tasks`} className={styles.resultsLink}>
          {copy.viewAllTasks}
        </Link>
        <button type="button" className={styles.resultsLink} onClick={onClear}>
          {copy.clearResults}
        </button>
      </div>
    </section>
  )
}
