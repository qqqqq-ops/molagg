'use client'

import { useState } from 'react'
import { LogOut, Settings, UserRound } from 'lucide-react'
import { useLocale, useTranslations } from '@/i18n/client'
import { useRouter } from '@/lib/router'

import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils/cn'

interface UserMenuProps {
  variant?: 'full' | 'compact'
  dropdownSide?: 'bottom' | 'right'
  forceLight?: boolean
  className?: string
  showNativeTitle?: boolean
}

export const UserMenu = ({
  variant = 'full',
  dropdownSide = 'bottom',
  forceLight = false,
  className,
  showNativeTitle = true,
}: UserMenuProps) => {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()
  const { user, logout } = useAuth()
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const isCompact = variant === 'compact'
  const label = user?.username || user?.email || t('loginTitle')

  const onLogout = () => {
    logout()
    router.replace(`/${locale}/auth/login`)
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          'relative border backdrop-blur-sm shadow-canvas transition-all duration-300 ease-out hover:border-aurora-purple/30 hover:text-aurora-purple active:scale-[0.985]',
          'bg-white/80 border-stone-200 text-stone-700',
          !forceLight && 'dark:bg-stone-800/80 dark:border-stone-700 dark:text-stone-200',
        )}
        aria-label={label}
        title={showNativeTitle ? label : undefined}
      >
        <UserRound className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} strokeWidth={2} />
      </button>

      {isMenuOpen && (
        <div
          className={cn(
            'absolute z-50 min-w-44 overflow-hidden rounded-2xl border border-stone-200 bg-white/95 py-1 shadow-canvas backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95',
            dropdownSide === 'right' ? 'left-[calc(100%+12px)] bottom-0' : 'right-0 top-[calc(100%+8px)]',
          )}
        >
          <div className="border-b border-stone-100 px-3 py-2 dark:border-stone-800">
            <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{label}</p>
            {user?.email && <p className="truncate text-xs text-stone-400">{user.email}</p>}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            onClick={() => {
              setIsMenuOpen(false)
              setIsConfigOpen(true)
            }}
          >
            <Settings className="h-4 w-4" />
            {t('settings')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            {t('logout')}
          </button>
        </div>
      )}

      <SystemConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </div>
  )
}
