import { defaultLocale } from '@/i18n/locales'
import { useAuthStore } from '../store/authStore'

let redirecting = false

export function isSafeNextPath(locale: string, next: string) {
  if (!next.startsWith('/') || next.startsWith('//')) return false

  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return false
    if (!url.pathname.startsWith(`/${locale}`)) return false
    if (url.pathname.includes('/auth/')) return false
    return true
  } catch {
    return false
  }
}

export function buildLoginHref(locale: string, nextPath?: string) {
  if (nextPath && isSafeNextPath(locale, nextPath)) {
    return `/${locale}/auth/login?next=${encodeURIComponent(nextPath)}`
  }
  return `/${locale}/auth/login`
}

export function readSafeNextPath(locale: string, search: string) {
  const next = new URLSearchParams(search).get('next') || ''
  return isSafeNextPath(locale, next) ? next : `/${locale}`
}

export function handleUnauthorizedStatus(status?: number): boolean {
  if (status !== 401) return false
  if (typeof window === 'undefined') return false

  const path = window.location.pathname
  if (path.includes('/auth/')) return false
  if (redirecting) return true

  redirecting = true
  useAuthStore.getState().logout()

  const locale = path.split('/').filter(Boolean)[0] || defaultLocale
  const next = `${path}${window.location.search}`
  window.location.assign(buildLoginHref(locale, next))
  return true
}
