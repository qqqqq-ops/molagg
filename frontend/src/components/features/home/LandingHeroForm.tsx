'use client'

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'

import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { RelayPriceNote } from '@/components/shared/RelayPriceNote'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRelayPricing } from '@/lib/hooks/useRelayPricing'
import { RELAY_PRICING, type ImageTier } from '@/lib/utils/relayPricing'
import { pickDefaultModelId } from '@/lib/utils/defaultModels'
import { VIDEO_MODEL_SAMPLES, findSampleModelId } from '@/lib/prompts/videoModelSamples'
import { useLandingHomePageShell } from './LandingHomePageShellClient'
import { LandingResults } from './LandingResults'
import {
  LANDING_MAX_IMAGE_COUNT,
  filterLandingModels,
  getMaxReferenceImages,
  getFixedVideoDuration,
  getVideoDurationOptions,
  isGptImageModel,
  LANDING_GPT_IMAGE_SIZES,
} from './landingGenerate'
import { LANDING_IMAGE_SAMPLES, buildCreateHref, type LandingHomeCopy } from './landingHomePage.shared'
import { useLandingGeneration } from './useLandingGeneration'
import styles from './LandingHomePage.module.css'

type LandingHeroFormProps = {
  locale: string
  copy: LandingHomeCopy
}

const IMAGE_COUNTS = Array.from({ length: LANDING_MAX_IMAGE_COUNT }, (_, index) => index + 1)
const IMAGE_TIERS: ImageTier[] = ['standard', 'realistic']

/**
 * 落地页就地生成：一句描述 + 可选参考图 + 张数/时长，结果直接出在这一页。
 * 需要更多参数（比例、分辨率、首尾帧、项目…）的走「高级版」，也就是创作页。
 */
export function LandingHeroForm({ locale, copy }: LandingHeroFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { mode, navigateWithTransition, setHeroPinned, setMode } = useLandingHomePageShell()
  const { user, isAuthenticated } = useAuth()
  const userId = isAuthenticated ? (user?.id ?? null) : null
  const { models, modelsLoading, reloadModels, jobs, submit, clearJobs } = useLandingGeneration({ mode, userId })

  const [prompt, setPrompt] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [imageCount, setImageCount] = useState(1)
  const [duration, setDuration] = useState(5)
  const [imageSize, setImageSize] = useState<string>(LANDING_GPT_IMAGE_SIZES[0].value)
  const [imageTier, setImageTier] = useState<ImageTier>('standard')

  const hasReference = referenceImages.length > 0
  const candidates = useMemo(() => filterLandingModels(models, hasReference), [models, hasReference])
  const selectedModel = candidates.find((model) => model.id === selectedModelId)
  const priceFor = useRelayPricing()
  const durationOptions = useMemo(() => getVideoDurationOptions(selectedModel), [selectedModel])
  const fixedDuration = getFixedVideoDuration(selectedModel)
  const maxReferences = getMaxReferenceImages(mode, selectedModel)
  const price = priceFor(selectedModel)
  // GPT Image 出图：首页直接给比例；走站长的 opusapi 时再给「通用 / 写实增强」（写实增强是另一个上游模型，别的中转站未必有）
  const isGptImage = mode === 'image' && isGptImageModel(selectedModel)
  const showSizeChoice = isGptImage && !hasReference
  const showTierChoice = isGptImage && price?.kind === 'image'
  const activeTier: ImageTier = showTierChoice ? imageTier : 'standard'

  const referencePreviews = useMemo(() => referenceImages.map((file) => URL.createObjectURL(file)), [referenceImages])
  useEffect(() => () => referencePreviews.forEach((url) => URL.revokeObjectURL(url)), [referencePreviews])

  useEffect(() => {
    if (candidates.length === 0) return
    // 默认：图片 GPT Image 2、视频 Seedance 2.5；没配就用列表第一个
    if (!candidates.some((model) => model.id === selectedModelId)) setSelectedModelId(pickDefaultModelId(candidates, mode))
  }, [candidates, mode, selectedModelId])

  useEffect(() => {
    if (durationOptions.includes(duration)) return
    setDuration(durationOptions.includes(5) ? 5 : durationOptions[0])
  }, [duration, durationOptions])

  // 视频只收一张参考图；从图片切过来时多出来的要去掉
  useEffect(() => {
    if (referenceImages.length > maxReferences) setReferenceImages((prev) => prev.slice(0, maxReferences))
  }, [maxReferences, referenceImages.length])

  useEffect(() => {
    setHeroPinned(jobs.length > 0)
  }, [jobs.length, setHeroPinned])

  const shake = () => {
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 500)
    inputRef.current?.focus()
  }

  const addReferenceFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    setReferenceImages((prev) => [...prev, ...images].slice(0, maxReferences))
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault()
      addReferenceFiles(files)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!prompt.trim()) {
      shake()
      return
    }

    if (!userId) {
      navigateWithTransition(`/${locale}/auth/login`)
      return
    }

    if (!selectedModel) {
      if (!modelsLoading) setIsConfigOpen(true)
      return
    }

    setIsSubmitting(true)
    try {
      await submit({
        mode,
        prompt: prompt.trim(),
        model: selectedModel,
        count: imageCount,
        duration,
        referenceImages,
        size: showSizeChoice ? imageSize : undefined,
        gptImageModel: activeTier === 'realistic' ? RELAY_PRICING.image.realisticModel : undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderOptions = () => {
    if (!userId) return <span className={styles.optionHint}>{copy.loginRequired}</span>
    if (modelsLoading && models.length === 0) return <span className={styles.optionHint}>{copy.loadingModels}</span>
    if (candidates.length === 0) {
      return (
        <>
          <span className={styles.optionHint}>{hasReference ? copy.noReferenceModels : copy.noModels}</span>
          <button type="button" className={styles.sampleChip} onClick={() => setIsConfigOpen(true)}>
            {copy.configureChannel}
          </button>
        </>
      )
    }

    return (
      <>
        <label className={styles.optionGroup}>
          <span className={styles.optionLabel}>{copy.modelLabel}</span>
          <select
            className={styles.modelSelect}
            value={selectedModel?.id ?? ''}
            onChange={(event) => setSelectedModelId(event.target.value)}
          >
            {candidates.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>

        {mode === 'video' && fixedDuration ? (
          // 上游锁死时长、按条计费（Molagg Seedance 2.5）：不给选
          <div className={styles.optionGroup}>
            <span className={styles.optionLabel}>{copy.durationLabel}</span>
            <span className={styles.optionLabel}>{copy.fixedDuration.replace('{seconds}', String(fixedDuration))}</span>
          </div>
        ) : (
        <div
          className={styles.optionGroup}
          role="radiogroup"
          aria-label={mode === 'image' ? copy.countLabel : copy.durationLabel}
        >
          <span className={styles.optionLabel}>{mode === 'image' ? copy.countLabel : copy.durationLabel}</span>
          {(mode === 'image' ? IMAGE_COUNTS : durationOptions).map((value) => {
            const active = mode === 'image' ? imageCount === value : duration === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.optionChip} ${active ? styles.optionChipActive : ''}`}
                onClick={() => (mode === 'image' ? setImageCount(value) : setDuration(value))}
              >
                {value}
                {mode === 'image' ? copy.imageUnit : copy.secondsUnit}
              </button>
            )
          })}
        </div>
        )}

        {showSizeChoice ? (
          <div className={styles.optionGroup} role="radiogroup" aria-label={copy.sizeLabel}>
            <span className={styles.optionLabel}>{copy.sizeLabel}</span>
            {LANDING_GPT_IMAGE_SIZES.map((option, index) => {
              const active = imageSize === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`${styles.optionChip} ${active ? styles.optionChipActive : ''}`}
                  onClick={() => setImageSize(option.value)}
                >
                  {[copy.sizeSquare, copy.sizeLandscape, copy.sizePortrait][index]}
                </button>
              )
            })}
          </div>
        ) : null}

        {showTierChoice ? (
          <div className={styles.optionGroup} role="radiogroup" aria-label={copy.tierLabel}>
            <span className={styles.optionLabel}>{copy.tierLabel}</span>
            {IMAGE_TIERS.map((tier) => {
              const active = imageTier === tier
              return (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`${styles.optionChip} ${active ? styles.optionChipActive : ''}`}
                  onClick={() => setImageTier(tier)}
                >
                  {tier === 'realistic' ? copy.tierRealistic : copy.tierStandard}
                </button>
              )
            })}
          </div>
        ) : null}

        {/* 走站长两个中转站时才显示价格；首页选了画质就只报这一档 */}
        <RelayPriceNote
          price={price}
          count={mode === 'image' ? imageCount : 1}
          imageTier={showTierChoice ? imageTier : undefined}
        />
      </>
    )
  }

  return (
    <div className={styles.interactionArea}>
      <form action={`/${locale}/create`} method="get" className={styles.heroForm} onSubmit={handleSubmit}>
        <input type="hidden" name="mode" value={mode} />

        <div className={styles.modeSwitcher} data-mode={mode}>
          <div className={styles.modeIndicator} />
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'image' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('image')}
          >
            <svg className={styles.modeButtonIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path
                d="M21 15L16 10 5 21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {copy.imageMode}
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'video' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('video')}
          >
            <svg className={styles.modeButtonIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
            </svg>
            {copy.videoMode}
          </button>
        </div>

        <div className={`${styles.inputWrapper} ${isShaking ? styles.inputWrapperError : ''}`}>
          <button
            type="button"
            className={styles.attachButton}
            aria-label={copy.addReference}
            title={`${copy.addReference} · ${copy.referenceLimit.replace('{max}', String(maxReferences))}`}
            disabled={referenceImages.length >= maxReferences}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={maxReferences > 1}
            hidden
            onChange={(event) => {
              addReferenceFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <input
            ref={inputRef}
            type="text"
            name="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={handlePaste}
            className={styles.promptInput}
            placeholder={mode === 'image' ? copy.imagePlaceholder : copy.videoPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className={styles.submitButton}
            aria-label={copy.generate}
            title={copy.generate}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className={styles.resultSpinner} aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 19V5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>

        {hasReference ? (
          <div className={styles.referenceRow}>
            {referencePreviews.map((url, index) => (
              <div key={url} className={styles.referenceThumb}>
                <img src={url} alt="" />
                <button
                  type="button"
                  aria-label={copy.removeReference}
                  onClick={() => setReferenceImages((prev) => prev.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.optionRow}>
          {/* 输入框里的回形针太小，用户找不到，这里再放一个带字的入口 */}
          <button
            type="button"
            className={styles.advancedButton}
            disabled={referenceImages.length >= maxReferences}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {copy.addReference}
            {hasReference ? ` ${referenceImages.length}/${maxReferences}` : ''}
          </button>
          {renderOptions()}
        </div>

        {/* 比例落地页不给选，但要说清楚现在是什么、去哪改 —— 高级版入口放这一行，做成显眼的按钮 */}
        <div className={styles.advancedRow}>
          {showSizeChoice ? <span /> : (
          <span className={styles.ratioNote}>
            {copy.ratioLabel}
            <strong>
              {hasReference ? copy.ratioFollowReference : mode === 'image' ? copy.ratioImageDefault : copy.ratioVideoDefault}
            </strong>
            <span className={styles.ratioNoteHint}>{copy.advancedHint}</span>
          </span>
          )}
          <button
            type="button"
            className={styles.advancedCta}
            onClick={() => navigateWithTransition(buildCreateHref(locale, mode, prompt))}
          >
            {copy.advanced}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* 样本只填提示词，不再跳走；视频样本顺带把匹配的模型和时长选上 */}
        <div className={styles.sampleRow}>
          <span className={styles.sampleHint}>{copy.trySample}</span>
          <div className={styles.sampleChips}>
            {mode === 'video'
              ? VIDEO_MODEL_SAMPLES.slice(0, 5).map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={styles.sampleChip}
                    onClick={() => {
                      setPrompt(sample.prompt)
                      const modelId = findSampleModelId(candidates, sample)
                      if (modelId) setSelectedModelId(modelId)
                      const sampleDuration = Number(sample.duration)
                      if (Number.isFinite(sampleDuration)) setDuration(sampleDuration)
                    }}
                  >
                    {sample.tag}
                  </button>
                ))
              : LANDING_IMAGE_SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={styles.sampleChip}
                    onClick={() => setPrompt(sample.prompt)}
                  >
                    {sample.tag}
                  </button>
                ))}
          </div>
        </div>
      </form>

      {/* 结果和弹窗都放在表单外：弹窗里的表单提交会顺着 React 树冒泡到这里触发生成 */}
      <LandingResults
        locale={locale}
        copy={copy}
        jobs={jobs}
        onClear={clearJobs}
        onConfigure={() => setIsConfigOpen(true)}
      />

      <SystemConfigModal
        isOpen={isConfigOpen}
        onClose={() => {
          setIsConfigOpen(false)
          reloadModels()
        }}
      />
    </div>
  )
}
