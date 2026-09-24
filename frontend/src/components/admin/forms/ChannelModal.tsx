/**
 * 个人版固定渠道配置模态框
 */

'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/i18n/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { userSettingsService } from '@/lib/api/services/userSettings'
import type { Channel, UpdateChannelDto } from '@/lib/api/types/admin/channels'

/**
 * 默认地址指向站长自己中转站的渠道（GPT Image → api.opusapi.xyz、Molagg 视频 → molagg.com，见 prisma/default-api-channels.json）。
 * 地址默认填好，但 key 不预置——要用的人向站长索取，这里提示一句。
 */
const OWNER_RELAY_CHANNEL_IDS = new Set(['3', '17'])

const labelClassName = 'block font-ui text-sm font-medium text-stone-700 dark:text-stone-200'
const inputClassName =
  'w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 font-mono text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500'

interface ChannelModalProps {
  isOpen: boolean
  onClose: () => void
  channel?: Channel
  onSuccess?: () => void
}

export function ChannelModal({
  isOpen,
  onClose,
  channel,
  onSuccess,
}: ChannelModalProps) {
  const t = useTranslations('settings.channelModal')
  const tCommon = useTranslations('settings.common')

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (channel) {
      setBaseUrl(channel.baseUrl)
      setApiKey('')
    }
  }, [channel, isOpen])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!channel) {
      setError(t('errors.channelRequired'))
      return
    }

    if (!baseUrl.trim()) {
      setError(t('errors.baseUrlRequired'))
      return
    }

    if (!channel.apiKey && !apiKey.trim()) {
      setError(t('errors.apiKeyRequired'))
      return
    }

    setLoading(true)
    try {
      const updateDto: UpdateChannelDto = {
        baseUrl: baseUrl.trim(),
      }

      if (apiKey.trim()) {
        updateDto.apiKey = apiKey.trim()
      }

      await userSettingsService.updateChannel(channel.id, updateDto)
      onSuccess?.()
      handleClose()
    } catch (err) {
      setError(t('errors.updateFailed'))
      console.error('Failed to save channel:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError('')
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={channel ? `${t('edit')} · ${channel.name}` : t('edit')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={cn(labelClassName, 'mb-2')}>
            {t('fields.baseUrl')} <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={t('placeholders.baseUrl')}
            className={inputClassName}
            required
          />
        </div>

        <div>
          <label className={cn(labelClassName, 'mb-2')}>
            {t('fields.apiKey')} {!channel?.apiKey && <span className="text-red-500">*</span>}
            {channel?.apiKey ? (
              <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
                {t('apiKeyKeep')}
              </span>
            ) : null}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={channel?.apiKey ? t('placeholders.apiKeyEdit') : t('placeholders.apiKeyCreate')}
            className={inputClassName}
            required={!channel?.apiKey}
          />
          {channel && OWNER_RELAY_CHANNEL_IDS.has(String(channel.id)) && !channel.apiKey ? (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('apiKeyAskOwner')}</p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
            <p className="font-ui text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        ) : null}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            loadingText={tCommon('loading')}
            disabled={loading}
            className="flex-1"
          >
            {tCommon('save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
