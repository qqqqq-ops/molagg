'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useRouter, useSearchParams } from '@/lib/router'
import { useMessages, useTranslations } from '@/i18n/client'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { MagicInput } from '@/components/ui/MagicInput'
import { authService } from '@/lib/api/services/auth'
import { ApiClientError } from '@/lib/api/error'
import { useAuth } from '@/lib/hooks/useAuth'
import { useAuthStore } from '@/lib/store/authStore'
import { readSafeNextPath } from '@/lib/local/session'
import { cn } from '@/lib/utils/cn'
import { AuthBackdrop, AuthVerbCycle, ModelGlobe, ModelSpotlight, useShowcaseModels } from './AuthShowcase'

type AuthPageProps = {
  locale: string
  mode: 'login' | 'register'
}

const FALLBACK_VERBS = ['生成图片', '生成视频']

/** verbs / verbNotes 是数组，t() 只返回字符串，所以从原始 messages 里取。 */
function useShowcaseStrings(key: 'verbs' | 'verbNotes', fallback: string[]): string[] {
  const messages = useMessages() as {
    auth?: { showcase?: Record<string, unknown> }
  }

  return useMemo(() => {
    const value = messages.auth?.showcase?.[key]
    if (!Array.isArray(value)) return fallback
    const cleaned = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    return cleaned.length > 0 ? cleaned : fallback
  }, [messages, key, fallback])
}

export function AuthPage({ locale, mode }: AuthPageProps) {
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isReady } = useAuth()
  const login = useAuthStore((state) => state.login)
  const nextPath = readSafeNextPath(locale, `?${searchParams.toString()}`)
  const verbs = useShowcaseStrings('verbs', FALLBACK_VERBS)
  const verbNotes = useShowcaseStrings('verbNotes', [])
  const showcaseModels = useShowcaseModels()

  const [formMode, setFormMode] = useState<'login' | 'register'>(mode)
  // 第二层默认收起。例外：带 next 参数说明是从受保护页面被弹回来的，用户本来就是要登录。
  const [isFormOpen, setIsFormOpen] = useState(() => Boolean(searchParams.get('next')))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isRegister = formMode === 'register'

  // 已登录的人也能回到这里看模型球（它就是站点首页），所以不再无条件跳走；
  // 只有从受保护页面被弹回来（带 next）时才直接放行回原页
  const hasNextParam = Boolean(searchParams.get('next'))
  useEffect(() => {
    if (isReady && isAuthenticated && hasNextParam) {
      router.replace(nextPath)
    }
  }, [hasNextParam, isAuthenticated, isReady, nextPath, router])

  const signedIn = isReady && isAuthenticated
  const enterWorkspace = () => router.push(`/${locale}`)

  const closeForm = useCallback(() => {
    if (submitting) return
    setIsFormOpen(false)
  }, [submitting])

  // 第二层打开时锁滚动 + Esc 关闭
  useEffect(() => {
    if (!isFormOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeForm()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isFormOpen, closeForm])

  const openForm = (nextMode: 'login' | 'register') => {
    setFormMode(nextMode)
    setError('')
    setIsFormOpen(true)
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const session = isRegister
        ? await authService.register({
            email,
            password,
            username: username.trim() || undefined,
          })
        : await authService.login({ email, password })

      login(session)
      router.replace(nextPath)
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : isRegister ? t('registerTitle') : t('loginTitle')
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    /* 登录页固定深色，不跟随主题 —— 深底是这套观感的前提 */
    <div className="auth-void relative min-h-[100dvh] overflow-hidden">
      {/* ===== 第一层：始终在动，弹出第二层时只被虚化，不卸载 ===== */}
      <div
        className="auth-stage relative flex h-[100dvh] flex-col overflow-hidden"
        data-dimmed={isFormOpen ? 'true' : 'false'}
        aria-hidden={isFormOpen ? 'true' : undefined}
      >
        <AuthBackdrop />

        <header className="absolute inset-x-0 top-0 z-30 mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Logo variant="light" />
          <div className="flex items-center gap-2.5">
            {signedIn ? null : (
              <button
                type="button"
                onClick={() => openForm('register')}
                className="rounded-full px-3 py-2 text-sm font-medium text-white/55 transition-colors hover:text-white"
              >
                {t('registerTitle')}
              </button>
            )}
            <button
              type="button"
              onClick={signedIn ? enterWorkspace : () => openForm('login')}
              className="rounded-xl border border-white/15 bg-white/10 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              {signedIn ? t('enterWorkspace') : t('loginTitle')}
            </button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-5 sm:px-8">
          <div className="relative flex w-full max-w-[1400px] items-center justify-center">
            {/* 左侧模型介绍轮播 */}
            <div className="hidden shrink-0 xl:block">
              <ModelSpotlight
                models={showcaseModels}
                offset={0}
                align="left"
                modelWord={t('showcase.modelWord')}
                typeLabels={{ image: t('showcase.typeImage'), video: t('showcase.typeVideo'), chat: t('showcase.typeChat') }}
              />
            </div>

            {/* 中间：模型球 + 叠在球心的文案 */}
            <div className="relative mx-auto w-full" style={{ maxWidth: 'min(88vh, 900px)' }}>
              <ModelGlobe label={t('showcase.orbitLabel')} models={showcaseModels} />

              <div className="auth-center-copy pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-6">
                <AuthVerbCycle
                  prefix={t('showcase.verbPrefix')}
                  verbs={verbs}
                  notes={verbNotes}
                />

                <button
                  type="button"
                  onClick={signedIn ? enterWorkspace : () => openForm('login')}
                  className="pointer-events-auto rounded-xl border border-white/20 bg-white/10 px-10 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/20"
                >
                  {signedIn ? t('enterWorkspace') : t('loginTitle')}
                </button>
              </div>
            </div>

            {/* 右侧模型介绍轮播，错开一位，避免和左边展示同一个模型 */}
            <div className="hidden shrink-0 xl:block">
              <ModelSpotlight
                models={showcaseModels}
                offset={7}
                align="right"
                modelWord={t('showcase.modelWord')}
                typeLabels={{ image: t('showcase.typeImage'), video: t('showcase.typeVideo'), chat: t('showcase.typeChat') }}
              />
            </div>
          </div>
        </div>

        <p className="absolute inset-x-0 bottom-0 z-30 pb-3 text-center text-[11px] tracking-[0.25em] text-white/30">
          {t('showcase.ringHead')}
        </p>
      </div>

      {/* ===== 第二层：底色透明，透过它能看到第一层虚化后仍在环绕的画面 ===== */}
      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8"
          role="presentation"
          onClick={closeForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isRegister ? t('registerTitle') : t('loginTitle')}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'relative w-full max-w-[420px] overflow-hidden rounded-[30px] px-6 py-8 sm:px-8',
              // 只有很薄的一层底色，主要靠边框和高光把卡片从背景里"切"出来
              'border border-white/15 bg-white/[0.07] shadow-[0_30px_80px_rgba(0,0,0,0.55)]',
            )}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
            />

            <button
              type="button"
              onClick={closeForm}
              aria-label={t('loginTitle')}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <h1 className="mb-2 text-center text-2xl font-semibold text-white">
              {isRegister ? t('registerTitle') : t('loginTitle')}
            </h1>
            <p className="mb-6 text-center text-sm leading-6 text-white/60">
              {isRegister ? t('registerSubtitle') : t('loginSubtitle')}
            </p>

            <form className="space-y-4" onSubmit={onSubmit}>
              {isRegister && (
                <MagicInput
                  label={t('usernameOptional')}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t('usernamePlaceholder')}
                  autoComplete="username"
                />
              )}
              <MagicInput
                label={t('email')}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                required
              />
              <MagicInput
                label={t('password')}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('passwordPlaceholder')}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                minLength={8}
              />

              {error ? (
                <p className="text-sm text-red-500">{error}</p>
              ) : isRegister ? (
                <p className="text-xs text-white/45">{t('firstAdminHint')}</p>
              ) : null}

              <Button type="submit" className="w-full" isLoading={submitting} loadingText={t('submitting')}>
                {isRegister ? t('submitRegister') : t('submitLogin')}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-white/60">
              {isRegister ? t('hasAccount') : t('noAccount')}{' '}
              <button
                type="button"
                onClick={() => {
                  setFormMode(isRegister ? 'login' : 'register')
                  setError('')
                }}
                className="font-medium text-aurora-purple hover:underline"
              >
                {isRegister ? t('goLogin') : t('goRegister')}
              </button>
            </p>

            {submitting ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 rounded-[30px] bg-black/45 backdrop-blur-sm">
                <Loader2 className="h-4 w-4 animate-spin text-aurora-purple" />
                <span className="text-sm font-medium text-white/85">
                  {t('submitting')}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
