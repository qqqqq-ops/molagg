'use client'

import { useAuthStore } from '@/lib/store/authStore'
import { useCallback, useMemo } from 'react'

export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    _hasHydrated,
    logout: storeLogout,
  } = useAuthStore()

  const isAdmin = useMemo(() => user?.role === 'admin', [user])

  const logout = useCallback(() => {
    storeLogout()
  }, [storeLogout])

  const requireAuth = useCallback(() => Boolean(user && isAuthenticated), [user, isAuthenticated])

  return {
    user,
    isAuthenticated,
    isAdmin,
    isReady: _hasHydrated,
    logout,
    requireAuth,
  }
}
