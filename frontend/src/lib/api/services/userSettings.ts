import { apiClient } from '../client'
import '../interceptors'
import type { Channel, ChannelTestResult, UpdateChannelDto } from '../types/admin/channels'

export type UserAiSettings = {
  apiBaseUrl: string
  apiKey: string
  modelName: string
}

export const userSettingsService = {
  getChannels: async (): Promise<Channel[]> => {
    return apiClient.get('/settings/channels')
  },

  updateChannel: async (id: string, dto: UpdateChannelDto): Promise<Channel> => {
    return apiClient.put(`/settings/channels/${id}`, dto)
  },

  testConnection: async (id: string): Promise<ChannelTestResult> => {
    return apiClient.post(`/settings/channels/${id}/test`)
  },

  getAiSettings: async (): Promise<UserAiSettings> => {
    return apiClient.get('/settings/ai')
  },

  updateAiSettings: async (data: Partial<UserAiSettings>): Promise<UserAiSettings> => {
    return apiClient.put('/settings/ai', data)
  },
}
