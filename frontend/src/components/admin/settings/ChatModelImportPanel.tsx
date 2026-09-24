/**
 * 文本模型批量添加。
 *
 * 两个来源：
 * 1. 问中转站要 —— GET {baseUrl}/v1/models，拿到的是这把 Key 真正能用的模型；
 * 2. 内置清单 —— 中转站不支持 /v1/models 时的兜底。
 *
 * 只负责挑选和逐个调用 createChatModel，不自己碰数据库。
 */

'use client'

import { useState } from 'react'
import { Check, Download, List, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { adminAiService, type DiscoveredChatModel } from '@/lib/api/services/admin/ai'
import { ApiClientError } from '@/lib/api/error'
import { cn } from '@/lib/utils/cn'
import { CHAT_MODEL_CATALOG, CATALOG_MODEL_COUNT } from './chatModelCatalog'

type Source = 'remote' | 'catalog'

type Candidate = {
  name: string
  modelKey: string
  hint: string
  vision: boolean
  alreadyAdded: boolean
}

function catalogCandidates(existingKeys: Set<string>): Candidate[] {
  return CHAT_MODEL_CATALOG.flatMap((group) =>
    group.models.map((model) => ({
      name: model.name,
      modelKey: model.modelKey,
      hint: group.vendor,
      vision: Boolean(model.vision),
      alreadyAdded: existingKeys.has(model.modelKey),
    })),
  )
}

function remoteCandidates(models: DiscoveredChatModel[]): Candidate[] {
  return models.map((model) => ({
    // 上游只给 id，拿它同时当显示名，用户可以之后自己改
    name: model.modelKey,
    modelKey: model.modelKey,
    hint: '',
    vision: false,
    alreadyAdded: model.alreadyAdded,
  }))
}

export function ChatModelImportPanel({
  existingModelKeys,
  onImported,
}: {
  existingModelKeys: string[]
  onImported: () => void
}) {
  const [source, setSource] = useState<Source | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')

  const existingKeys = new Set(existingModelKeys)

  const openCatalog = () => {
    setSource('catalog')
    setRemoteUrl('')
    setCandidates(catalogCandidates(existingKeys))
    setSelected(new Set())
  }

  const openRemote = async () => {
    setIsLoading(true)
    try {
      const result = await adminAiService.discoverChatModels()
      setSource('remote')
      setRemoteUrl(result.url)
      setCandidates(remoteCandidates(result.models))
      setSelected(new Set())
    } catch (error) {
      // 后端已经把「Key 被拒 / 不支持 /v1/models / 连不上」分好类了，直接透出
      const message = error instanceof ApiClientError ? error.message : '获取模型列表失败'
      toast.error(message, { duration: 7000 })
    } finally {
      setIsLoading(false)
    }
  }

  const toggle = (modelKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(modelKey)) next.delete(modelKey)
      else next.add(modelKey)
      return next
    })
  }

  const selectableKeys = candidates.filter((c) => !c.alreadyAdded).map((c) => c.modelKey)
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k))

  const handleImport = async () => {
    const picked = candidates.filter((c) => selected.has(c.modelKey) && !c.alreadyAdded)
    if (picked.length === 0) return

    setIsImporting(true)
    let ok = 0
    const failures: string[] = []

    // 逐个走既有的 create 接口，复用它的重名校验等逻辑
    for (const item of picked) {
      try {
        await adminAiService.createChatModel({
          name: item.name,
          modelKey: item.modelKey,
          supportsImageInput: item.vision,
          isActive: true,
        })
        ok += 1
      } catch (error) {
        failures.push(item.modelKey)
      }
    }

    setIsImporting(false)
    setSource(null)

    if (ok > 0) toast.success(`已添加 ${ok} 个模型`)
    if (failures.length > 0) {
      toast.error(`${failures.length} 个未添加：${failures.slice(0, 3).join('、')}${failures.length > 3 ? '…' : ''}`)
    }
    onImported()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5 px-3 text-xs"
          onClick={() => void openRemote()}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          从中转站获取
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5 px-3 text-xs"
          onClick={openCatalog}
        >
          <List className="h-3.5 w-3.5" />
          内置清单（{CATALOG_MODEL_COUNT}）
        </Button>
      </div>

      <Modal
        isOpen={source !== null}
        onClose={() => setSource(null)}
        size="sm"
        title={source === 'remote' ? '选择要添加的模型' : '内置模型清单'}
      >
        <div className="space-y-3">
          <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
            {source === 'remote'
              ? `来自 ${remoteUrl}，这是当前 Key 能访问的模型。`
              : '候选名单（整理于 2026-09）。模型名以中转站实际返回为准，建议优先用「从中转站获取」。'}
          </p>

          <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-2 dark:border-stone-700">
            <button
              type="button"
              className="text-xs font-medium text-aurora-purple hover:underline"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(selectableKeys))
              }
            >
              {allSelected ? '取消全选' : `全选（${selectableKeys.length}）`}
            </button>
            <span className="text-xs text-stone-400">已选 {selected.size}</span>
          </div>

          <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {candidates.map((item) => {
              const isSelected = selected.has(item.modelKey)
              return (
                <button
                  key={item.modelKey}
                  type="button"
                  disabled={item.alreadyAdded}
                  onClick={() => toggle(item.modelKey)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
                    item.alreadyAdded
                      ? 'cursor-not-allowed border-stone-200 bg-stone-50 opacity-55 dark:border-stone-800 dark:bg-stone-900'
                      : isSelected
                        ? 'border-aurora-purple bg-aurora-purple/10'
                        : 'border-stone-200 hover:border-stone-300 dark:border-stone-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSelected
                        ? 'border-aurora-purple bg-aurora-purple text-white'
                        : 'border-stone-300 dark:border-stone-600',
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3" /> : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-stone-900 dark:text-stone-100">
                      {item.name}
                    </span>
                    {item.hint ? (
                      <span className="block truncate text-[11px] text-stone-400">{item.hint}</span>
                    ) : null}
                  </span>

                  {item.alreadyAdded ? (
                    <span className="shrink-0 text-[11px] text-stone-400">已添加</span>
                  ) : item.vision ? (
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                      识图
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3 dark:border-stone-700">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSource(null)}>
              <X className="mr-1 h-3.5 w-3.5" />
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selected.size === 0 || isImporting}
              isLoading={isImporting}
              loadingText="添加中..."
              onClick={() => void handleImport()}
            >
              添加所选 {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
