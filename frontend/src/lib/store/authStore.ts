import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '../api/types'

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  login: (data: {
    user: UserProfile
    accessToken: string
    refreshToken: string
  }) => void
  logout: () => void
  updateUser: (user: Partial<UserProfile>) => void
  updateToken: (accessToken: string) => void
  setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      login: ({ user, accessToken, refreshToken }) => {
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          _hasHydrated: true,
        })
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          _hasHydrated: true,
        })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : state.user,
        }))
      },

      updateToken: (accessToken) => {
        set({ accessToken })
      },

      setHasHydrated: (state) => {
        set({ _hasHydrated: state })
      },
    }),
    {
      name: 'flowmuse-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // localStorage 是同步存储，这个回调会在 create() 返回之前触发 —— 那时 useAuthStore 还没赋值，
      // 直接访问会抛 ReferenceError，并被 zustand 静默吞掉，_hasHydrated 永远是 false，
      // 所有套了 RequireAuth 的页面（资产库 / 画布 / 任务队列）一直停在「正在进入...」。
      // 推迟到微任务里执行，store 已经创建完成；存储读取出错时同样会置位，不会把人卡死。
      onRehydrateStorage: () => () => {
        queueMicrotask(() => useAuthStore.setState({ _hasHydrated: true }))
      },
    },
  ),
)
