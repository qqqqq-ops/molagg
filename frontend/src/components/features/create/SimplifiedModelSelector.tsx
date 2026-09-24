/**
 * 简化的模型选择器
 * 使用EnhancedSelect显示API返回的模型数据和图标
 * 没有可用模型时不做成死路，直接给出配置渠道的入口。
 */

'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useTranslations } from '@/i18n/client'

import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { EnhancedSelect, EnhancedSelectOption } from '@/components/ui/EnhancedSelect'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { cn } from '@/lib/utils/cn'

interface SimplifiedModelSelectorProps {
  models: ModelWithCapabilities[]
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  type: 'image' | 'video'
  label?: string
  compact?: boolean
  /** 配置弹窗关闭后触发，让外部重新拉取模型列表 —— 否则配好渠道这里依然是空的。 */
  onChannelsConfigured?: () => void
}

export function SimplifiedModelSelector({
  models,
  selectedModelId,
  onSelectModel,
  type,
  label,
  compact = false,
  onChannelsConfigured,
}: SimplifiedModelSelectorProps) {
  const t = useTranslations('create')
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  const typeLabel = type === 'image' ? t('models.typeImage') : t('models.typeVideo')

  // 没有可用模型时，原先只是把下拉框置灰，用户在这里无路可走。
  if (models.length === 0) {
    return (
      <>
        <div
          className={cn(
            'rounded-[16px] border border-dashed border-aurora-purple/40 bg-aurora-purple/[0.04] p-3',
            'dark:border-aurora-purple/30 dark:bg-aurora-purple/[0.07]',
          )}
        >
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {t('models.noModels', { type: typeLabel })}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
            {t('models.emptyHint')}
          </p>
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className={cn(
              'mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-aurora-purple px-3.5 py-2',
              'text-xs font-medium text-white transition hover:bg-aurora-purple-hover',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('models.configureChannels')}
          </button>
        </div>

        <SystemConfigModal
          isOpen={isConfigOpen}
          onClose={() => {
            setIsConfigOpen(false)
            onChannelsConfigured?.()
          }}
        />
      </>
    )
  }

  // 转换为EnhancedSelect选项
  const options: EnhancedSelectOption[] = models.map((model) => {
    return {
      value: model.id,
      label: model.name,
      icon: model.icon || model.capabilities?.providerIcon || null,
      iconType: type,
      badge: undefined,
      badgeColor: 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-200',
    }
  })

  return (
    <div className={cn(label ? 'space-y-2' : 'space-y-0')}>
      <EnhancedSelect
        label={label}
        value={selectedModelId}
        onChange={onSelectModel}
        options={options}
        placeholder={t('form.model.placeholder')}
        compact={compact}
      />
    </div>
  )
}
