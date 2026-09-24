import { apiClient } from '../client'
import '../interceptors'
import type { UserProfile } from '../types'

export type AuthSession = {
  user: UserProfile
  accessToken: string
  refreshToken: string
}

export type RegisterPayload = {
  email: string
  password: string
  username?: string
}

export type LoginPayload = {
  email: string
  password: string
}

export const authService = {
  register(payload: RegisterPayload) {
    return apiClient.post<AuthSession, AuthSession>('/auth/register', payload)
  },
  login(payload: LoginPayload) {
    return apiClient.post<AuthSession, AuthSession>('/auth/login', payload)
  },
  me() {
    return apiClient.get<UserProfile, UserProfile>('/auth/me')
  },
}
