import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from '@/lib/compat/link'
import { usePathname, useRouter } from '@/lib/router'
import { AuthPage } from '@/components/features/auth/AuthPage'
import { CanvasV2Content } from '@/components/features/canvas-v2/CanvasV2Content'
import { ChatContent } from '@/components/features/chat/ChatContent'
import { SimplifiedCreateContent } from '@/components/features/create/SimplifiedCreateContent'
import { LibraryContent } from '@/components/features/library/LibraryContent'
import { LandingHomePage } from '@/components/features/home/LandingHomePage'
import { ProjectDetailContent } from '@/components/features/projects/ProjectDetailContent'
import { TasksContent } from '@/components/features/tasks/TasksContent'
import { TemplatesContent } from '@/components/features/templates/TemplatesContent'
import { TutorialContent } from '@/components/features/tutorial/TutorialContent'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { UnauthorizedGuard } from '@/components/providers/UnauthorizedGuard'
import { ConditionalLayout } from '@/components/layouts/ConditionalLayout'
import { I18nProvider, useTranslations } from '@/i18n/client'
import { defaultLocale, locales, type Locale } from '@/i18n/locales'
import { tasksService } from '@/lib/api/services/tasks'
import { useAuth } from '@/lib/hooks/useAuth'
import { useAuthStore } from '@/lib/store/authStore'
import { buildLoginHref } from '@/lib/local/session'
import type { ApiTask } from '@/lib/api/types'

const SITE_TITLE = 'Molagg'
const HOME_HERO_TASK_PAGE_SIZE = 48

type RouteMatch = {
  locale: Locale
  redirectTo?: string
  routeKey: string
  element: React.ReactNode
}

function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale)
}

function withDefaultLocalePath(pathname: string) {
  if (pathname === '/') return `/${defaultLocale}`
  return `/${defaultLocale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

function RequireAuth({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { isAuthenticated, isReady } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isReady || isAuthenticated) return
    const next = `${pathname}${window.location.search}`
    router.replace(buildLoginHref(locale, next))
  }, [isAuthenticated, isReady, locale, pathname, router])

  if (!isReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        正在进入...
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}

function HomeRoute({ locale }: { locale: Locale }) {
  const { isAuthenticated, isReady } = useAuth()
  const [heroTasks, setHeroTasks] = useState<ApiTask[]>([])

  useEffect(() => {
    if (!isReady || !isAuthenticated) {
      setHeroTasks([])
      return
    }

    let cancelled = false

    tasksService
      .getFeed({
        page: 1,
        limit: HOME_HERO_TASK_PAGE_SIZE,
        status: 'completed',
      })
      .then((result) => {
        if (!cancelled) {
          setHeroTasks(result.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroTasks([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isReady])

  return <LandingHomePage locale={locale} heroTasks={heroTasks} />
}

function NotFoundRoute({ locale }: { locale: Locale }) {
  const t = useTranslations('errors.notFound')

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-stone-200 bg-white/80 px-8 py-10 shadow-canvas dark:border-stone-700 dark:bg-stone-900/80">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.3em] text-aurora-purple">404</p>
        <h1 className="mb-3 text-3xl font-semibold text-stone-900 dark:text-stone-100">
          {t('title')}
        </h1>
        <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
          {t('description')}
        </p>
        <Link
          href={`/${locale}`}
          className="inline-flex rounded-full bg-aurora-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-aurora-purple-hover"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  )
}

function resolveRoute(pathname: string): RouteMatch {
  const pathSegments = pathname.split('/').filter(Boolean)

  if (pathSegments.length === 0) {
    return {
      locale: defaultLocale,
      routeKey: `${defaultLocale}:home`,
      element: <HomeRoute locale={defaultLocale} />,
    }
  }

  const maybeLocale = pathSegments[0]

  if (!isLocale(maybeLocale)) {
    return {
      locale: defaultLocale,
      redirectTo: withDefaultLocalePath(pathname),
      routeKey: 'redirect',
      element: null,
    }
  }

  const locale = maybeLocale
  const routeSegments = pathSegments.slice(1)
  const [section, firstParam, secondParam] = routeSegments

  if (!section) {
    return {
      locale,
      routeKey: `${locale}:home`,
      element: <HomeRoute locale={locale} />,
    }
  }

  if (section === 'auth' && (firstParam === 'login' || firstParam === 'register') && routeSegments.length === 2) {
    return {
      locale,
      routeKey: `${locale}:auth:${firstParam}`,
      element: <AuthPage locale={locale} mode={firstParam} />,
    }
  }

  if (section === 'gallery') {
    if (routeSegments.length === 1) {
      return {
        locale,
        routeKey: `${locale}:gallery`,
        element: (
          <RequireAuth locale={locale}>
            <LibraryContent locale={locale} />
          </RequireAuth>
        ),
      }
    }
  }

  // 教程刻意不加登录守卫：第一次来的人还没注册，也应该能先把文档读完。
  if (section === 'tutorial' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:tutorial`,
      element: <TutorialContent locale={locale} />,
    }
  }

  if (section === 'create' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:create`,
      element: <SimplifiedCreateContent />,
    }
  }

  if (section === 'templates' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:templates`,
      element: (
        <RequireAuth locale={locale}>
          <TemplatesContent />
        </RequireAuth>
      ),
    }
  }

  if (section === 'projects') {
    if (!firstParam) {
      return {
        locale,
        routeKey: `${locale}:projects`,
        element: (
          <RequireAuth locale={locale}>
            {/* 「我的作品」和「项目」已合并为资产库，旧链接 /projects 仍然可用 */}
            <LibraryContent locale={locale} />
          </RequireAuth>
        ),
      }
    }

    return {
      locale,
      routeKey: `${locale}:projects:${firstParam}`,
      element: (
        <RequireAuth locale={locale}>
          <ProjectDetailContent projectId={firstParam} />
        </RequireAuth>
      ),
    }
  }

  if (section === 'tasks' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:tasks`,
      element: (
        <RequireAuth locale={locale}>
          <TasksContent />
        </RequireAuth>
      ),
    }
  }

  if (section === 'canvas' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:canvas`,
      element: (
        <RequireAuth locale={locale}>
          <CanvasV2Content />
        </RequireAuth>
      ),
    }
  }

  if (section === 'chat') {
    return {
      locale,
      routeKey: `${locale}:chat:${firstParam ?? 'new'}`,
      element: (
        <RequireAuth locale={locale}>
          <ChatContent initialConversationId={firstParam ?? null} />
        </RequireAuth>
      ),
    }
  }

  return {
    locale,
    routeKey: `${locale}:404:${routeSegments.join('/')}`,
    element: <NotFoundRoute locale={locale} />,
  }
}

function AppContent() {
  const pathname = usePathname()
  const router = useRouter()
  const route = useMemo(() => resolveRoute(pathname), [pathname])

  useEffect(() => {
    const finish = () => useAuthStore.setState({ _hasHydrated: true })
    const unsub = useAuthStore.persist.onFinishHydration(finish)
    if (useAuthStore.persist.hasHydrated()) finish()
    return unsub
  }, [])

  useEffect(() => {
    document.title = SITE_TITLE
    document.documentElement.lang = route.locale
  }, [route.locale])

  useEffect(() => {
    if (route.redirectTo) {
      router.replace(route.redirectTo)
    }
  }, [route.redirectTo, router])

  return (
    <I18nProvider locale={route.locale}>
      <ThemeProvider>
        <UnauthorizedGuard />
        <ConditionalLayout key={route.locale}>{route.element}</ConditionalLayout>
      </ThemeProvider>
    </I18nProvider>
  )
}

export function App() {
  return <AppContent />
}
