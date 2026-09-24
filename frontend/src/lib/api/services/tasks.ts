import { apiClient } from '../client'
import '../interceptors'
import type { TaskStatus } from '../types/common'
import type { PaginationParams, SlicePaginatedResult } from '../types/pagination'
import type { ApiTask } from '../types/task'

export type UnifiedTaskFeedItem = ApiTask

/** 任务队列顶部统计卡；active = pending + processing */
export type TaskStats = {
  active: number
  completed: number
  failed: number
  total: number
}

/** 每个模型最近成功任务的耗时中位数（毫秒），key 是 modelId */
export type TaskDurationEstimates = {
  models: Record<string, { medianMs: number; samples: number }>
}

export const tasksService = {
  async getFeed(
    params?: PaginationParams & {
      /** active = pending + processing */
      status?: TaskStatus | 'active'
      type?: 'image' | 'video'
      /** 数字 = 某个项目，'none' = 未归入项目 */
      projectId?: string
      q?: string
    }
  ): Promise<SlicePaginatedResult<UnifiedTaskFeedItem>> {
    return apiClient.get('/tasks/feed', { params })
  },

  async getStats(): Promise<TaskStats> {
    return apiClient.get('/tasks/stats')
  },

  async getDurationEstimates(): Promise<TaskDurationEstimates> {
    return apiClient.get('/tasks/estimates')
  },
}
