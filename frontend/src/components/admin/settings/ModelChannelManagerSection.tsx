'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from '@/i18n/client'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { userSettingsService } from '@/lib/api/services/userSettings'
import type { Channel, ChannelTestResult } from '@/lib/api/types/admin/channels'
import { isAdminModelsHiddenProvider } from '@/lib/constants/providers'

const labelCls = 'mb-2 block text-sm font-medium text-stone-700 dark:text-stone-200'
const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-4 py-2 font-mono text-sm text-stone-900 transition-colors placeholder:text-stone-400 focus:border-aurora-purple focus:outline-none focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500'
const panelCardCls =
  'border border-stone-200 !bg-white !shadow-sm dark:border-stone-800 dark:!bg-stone-950/80'

type ChannelDraft = {
  baseUrl: string
  apiKey: string
}

export function ModelChannelManagerSection() {
  const t = useTranslations('settings.media')
  const tCommon = useTranslations('settings.common')
  const tModal = useTranslations('settings.channelModal')

  const [channels, setChannels] = useState<Channel[]>([])
  const [drafts, setDrafts] = useState<Record<string, ChannelDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ChannelTestResult>>({})
  const [loading, setLoading] = useState(false)

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const response = await userSettingsService.getChannels()
      const visible = response.filter((channel) => !isAdminModelsHiddenProvider(channel.provider))
      setChannels(visible)
      setDrafts((current) => {
        const next: Record<string, ChannelDraft> = {}
        for (const channel of visible) {
          next[channel.id] = {
            baseUrl: current[channel.id]?.baseUrl ?? channel.baseUrl ?? '',
            apiKey: current[channel.id]?.apiKey ?? '',
          }
        }
        return next
      })
    } catch (error) {
      console.error('Failed to fetch channels:', error)
      toast.error(tCommon('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const testChannel = async (channel: Channel) => {
    setTestingId(channel.id)
    try {
      const result = await userSettingsService.testConnection(channel.id)
      setTestResults((current) => ({ ...current, [channel.id]: result }))
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [channel.id]: {
          ok: false,
          baseUrl: '',
          provider: channel.provider,
          reason: 'unreachable',
          message: error instanceof Error ? error.message : '测试失败',
          ms: 0,
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const saveChannel = async (channel: Channel, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const draft = drafts[channel.id] ?? { baseUrl: channel.baseUrl, apiKey: '' }
    if (!draft.baseUrl.trim()) {
      toast.error(tModal('errors.baseUrlRequired'))
      return
    }
    if (!channel.apiKey && !draft.apiKey.trim()) {
      toast.error(tModal('errors.apiKeyRequired'))
      return
    }

    setSavingId(channel.id)
    try {
      const payload: { baseUrl: string; apiKey?: string } = { baseUrl: draft.baseUrl.trim() }
      if (draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim()
      const updated = await userSettingsService.updateChannel(channel.id, payload)
      setChannels((items) => items.map((item) => (item.id === channel.id ? updated : item)))
      setDrafts((current) => ({
        ...current,
        [channel.id]: { baseUrl: updated.baseUrl || draft.baseUrl, apiKey: '' },
      }))
      toast.success(tCommon('saved'))
    } catch (error) {
      console.error('Failed to save channel:', error)
      toast.error(tModal('errors.updateFailed'))
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <Card className={`${panelCardCls} p-8`}>
        <div className="flex min-h-[160px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-aurora-purple dark:border-stone-800 dark:border-t-aurora-purple" />
        </div>
      </Card>
    )
  }

  if (channels.length === 0) {
    return <p className="text-sm text-stone-500">{tCommon('noData')}</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">{t('title')}</h3>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('description')}</p>
      </div>

      {channels.map((channel) => {
        const draft = drafts[channel.id] ?? { baseUrl: channel.baseUrl, apiKey: '' }
        const configured = Boolean(channel.apiKey)

        return (
          <form key={channel.id} onSubmit={(event) => void saveChannel(channel, event)}>
            <Card className={`${panelCardCls} space-y-4 p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{channel.name}</div>
                  <div className="text-xs text-stone-400">{channel.provider}</div>
                </div>
                <span
                  className={
                    configured
                      ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                  }
                >
                  {configured ? t('configured') : t('notConfigured')}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>{t('channels.fields.baseUrl')}</label>
                  <input
                    type="text"
                    value={draft.baseUrl}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [channel.id]: { ...draft, baseUrl: event.target.value },
                      }))
                    }
                    placeholder={tModal('placeholders.baseUrl')}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    {tModal('fields.apiKey')}
                    {configured ? (
                      <span className="ml-2 text-xs font-normal text-stone-400">{tModal('apiKeyKeep')}</span>
                    ) : null}
                  </label>
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [channel.id]: { ...draft, apiKey: event.target.value },
                      }))
                    }
                    placeholder={configured ? tModal('placeholders.apiKeyEdit') : tModal('placeholders.apiKeyCreate')}
                    className={inputCls}
                    autoComplete="off"
                  />
                </div>
              </div>

              {testResults[channel.id] ? (
                <div
                  className={
                    testResults[channel.id].ok
                      ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                  }
                >
                  {testResults[channel.id].message}
                  {testResults[channel.id].url ? (
                    <span className="mt-0.5 block break-all opacity-70">
                      {testResults[channel.id].url}
                      {testResults[channel.id].status ? ` · ${testResults[channel.id].status}` : ''}
                      {` · ${testResults[channel.id].ms}ms`}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={testingId === channel.id}
                  onClick={() => void testChannel(channel)}
                  className="rounded-lg px-5 py-2"
                >
                  {testingId === channel.id ? '测试中...' : t('channels.testConnection')}
                </Button>
                <Button
                  type="submit"
                  disabled={savingId === channel.id}
                  className="rounded-lg bg-aurora-purple px-6 py-2 text-white transition-colors hover:bg-aurora-purple/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingId === channel.id ? tCommon('saving') : tCommon('save')}
                </Button>
              </div>
            </Card>
          </form>
        )
      })}
    </div>
  )
}
