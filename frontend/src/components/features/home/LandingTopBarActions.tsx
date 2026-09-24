'use client'

import { useMemo } from 'react'
import { useTranslations } from '@/i18n/client'

import { useAuth } from '@/lib/hooks/useAuth'
import { MOLAGG_RELAY_URL } from '@/lib/utils/siteSettings'
import { useLandingHomePageShell } from './LandingHomePageShellClient'
import { type LandingHomeCopy } from './landingHomePage.shared'
import styles from './LandingHomePage.module.css'

type LandingTopBarActionsProps = {
  locale: string
  copy: LandingHomeCopy
}

export function LandingTopBarActions({
  locale,
  copy,
}: LandingTopBarActionsProps) {
  const { navigateWithTransition } = useLandingHomePageShell()
  const tMenu = useTranslations('nav.menu')

  /**
   * 标签一律取 nav.menu，和侧栏共用一套词：
   * 之前这里是硬编码中文，同一个 /chat 在落地页叫「工作流」、侧栏叫「对话创作」、
   * 页面标题叫「创作工作流」，新人会当成三个功能。
   *
   * 原本还有一个「快速」指向 /create?mode=video —— 和下面 hero 的「视频生成」
   * 是同一个入口，且「快速」二字不说明任何事，已删。
   */
  const capsuleMenuItems = useMemo(
    () => [
      { key: 'chat', label: tMenu('creationMenu.chatMode'), href: `/${locale}/chat` },
      { key: 'tasks', label: tMenu('tasks'), href: `/${locale}/tasks` },
      { key: 'library', label: tMenu('library'), href: `/${locale}/gallery` },
    ],
    [locale, tMenu],
  )

  return (
    <nav className={styles.capsuleMenu} aria-label={copy.workspace}>
      {capsuleMenuItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className={styles.capsuleMenuItem}
          onClick={() => navigateWithTransition(item.href)}
        >
          {item.label}
        </button>
      ))}
      <a
        href={MOLAGG_RELAY_URL}
        target="_blank"
        rel="noreferrer"
        className={`${styles.capsuleMenuItem} ${styles.capsuleMenuIconItem}`}
        aria-label="OpusAPI"
        title="OpusAPI"
      >
        <img src="/icons/opusapi.svg" alt="" aria-hidden="true" />
      </a>
    </nav>
  )
}

/** 回到站点首页（模型球那一页，路由在 auth/login；已登录时那页不再自动跳走）。 */
export function LandingHomeButton({ locale }: { locale: string }) {
  const { navigateWithTransition } = useLandingHomePageShell()
  const tMenu = useTranslations('nav.menu')

  return (
    <button
      type="button"
      className={`${styles.authActionButton} ${styles.homeButton}`}
      onClick={() => navigateWithTransition(`/${locale}/auth/login`)}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {tMenu('home')}
    </button>
  )
}

export function LandingAuthActions({ locale }: { locale: string }) {
  const { navigateWithTransition } = useLandingHomePageShell()
  const { isAuthenticated, isReady, user } = useAuth()
  const t = useTranslations('nav.user')

  if (!isReady) {
    return <div className={styles.authActionsPlaceholder} aria-hidden="true" />
  }

  if (isAuthenticated) {
    return (
      <button
        type="button"
        className={styles.authActionButton}
        onClick={() => navigateWithTransition(`/${locale}/gallery`)}
      >
        {user?.username || t('profile')}
      </button>
    )
  }

  return (
    <div className={styles.authActions}>
      <button
        type="button"
        className={styles.authActionButton}
        onClick={() => navigateWithTransition(`/${locale}/auth/login`)}
      >
        {t('login')}
      </button>
      <button
        type="button"
        className={`${styles.authActionButton} ${styles.authActionPrimary}`}
        onClick={() => navigateWithTransition(`/${locale}/auth/register`)}
      >
        {t('register')}
      </button>
    </div>
  )
}
