import { apiClient } from '../client'
import '../interceptors'

/** 画布图本体，就是 React Flow 的 { nodes, edges }；结构由画布自己定，这里不细写 */
export type CanvasGraph = { nodes: unknown[]; edges: unknown[] }

export type CanvasBoardRecord = {
  id: string
  name: string
  nodeCount: number
  edgeCount: number
  updatedAt: string
  graph: CanvasGraph
}

export type CanvasSnapshotSummary = {
  id: string
  label: string
  nodeCount: number
  edgeCount: number
  createdAt: string
}

export type CanvasTemplateSummary = {
  id: string
  name: string
  description: string | null
  nodeCount: number
  createdAt: string
  updatedAt: string
}

/** 画布存储：当前画布自动保存、版本快照、工作流模板（后端 src/canvas） */
export const canvasService = {
  async getCurrentBoard(): Promise<CanvasBoardRecord> {
    return apiClient.get('/canvas/boards/current')
  },

  async saveBoard(id: string, graph: CanvasGraph): Promise<Omit<CanvasBoardRecord, 'graph'>> {
    return apiClient.put(`/canvas/boards/${id}`, { graph })
  },

  async listSnapshots(boardId: string): Promise<CanvasSnapshotSummary[]> {
    return apiClient.get(`/canvas/boards/${boardId}/snapshots`)
  },

  async createSnapshot(boardId: string, graph: CanvasGraph, label?: string): Promise<CanvasSnapshotSummary> {
    return apiClient.post(`/canvas/boards/${boardId}/snapshots`, { graph, ...(label ? { label } : {}) })
  },

  async getSnapshot(id: string): Promise<CanvasSnapshotSummary & { graph: CanvasGraph }> {
    return apiClient.get(`/canvas/snapshots/${id}`)
  },

  async deleteSnapshot(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete(`/canvas/snapshots/${id}`)
  },

  async listTemplates(): Promise<CanvasTemplateSummary[]> {
    return apiClient.get('/canvas/templates')
  },

  async createTemplate(data: { name: string; description?: string; graph: CanvasGraph }): Promise<CanvasTemplateSummary> {
    return apiClient.post('/canvas/templates', data)
  },

  async getTemplate(id: string): Promise<CanvasTemplateSummary & { graph: CanvasGraph }> {
    return apiClient.get(`/canvas/templates/${id}`)
  },

  async deleteTemplate(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete(`/canvas/templates/${id}`)
  },
}
