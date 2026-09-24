/**
 * 新手教程页。
 * 内容在 tutorialContent.ts 里，这里只负责渲染和两个动作：
 * 复制提示词、把提示词带到创作页。
 */

'use client'

import { useMemo, useState } from 'react'
import { Check, ClipboardCopy, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { PageTransition } from '@/components/shared/PageTransition'
import { useRouter } from '@/lib/router'
import { cn } from '@/lib/utils/cn'
import {
  getTutorialData,
  type TutorialData,
  type TutorialSection,
} from './tutorialData'

interface TutorialContentProps {
  locale: string
}

const cardCls =
  'rounded-[24px] border border-stone-200 bg-white p-5 shadow-canvas sm:p-6 dark:border-stone-800 dark:bg-stone-950'

function SectionHeading({ index, title, lead }: { index: number; title: string; lead: string }) {
  return (
    <div className="mb-4 space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-aurora-purple text-[11px] font-semibold text-white">
          {index}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {title}
        </h2>
      </div>
      <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">{lead}</p>
    </div>
  )
}

export function TutorialContent({ locale }: TutorialContentProps) {
  const router = useRouter()
  const content = useMemo<TutorialData>(() => getTutorialData(locale), [locale])
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      toast.success(content.copied)
      window.setTimeout(() => setCopiedPrompt((current) => (current === prompt ? null : current)), 2000)
    } catch {
      // 非 https 或旧浏览器下剪贴板不可用，这时让用户自己选中复制
      toast.error(content.copyPrompt)
    }
  }

  const useTemplate = (prompt: string, mode: 'image' | 'video') => {
    const search = new URLSearchParams({ mode, prompt })
    router.push(`/${locale}/create?${search.toString()}`)
  }

  const renderSection = (section: TutorialSection, index: number) => {
    const heading = <SectionHeading index={index + 1} title={section.title} lead={section.lead} />

    if (section.kind === 'steps' || section.kind === 'order') {
      return (
        <section key={section.id} id={section.id} className={cn(cardCls, 'scroll-mt-24')}>
          {heading}
          <ol className="space-y-3">
            {section.items.map((item, itemIndex) => (
              <li
                key={item.title}
                className="flex gap-3 rounded-[16px] border border-stone-100 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-stone-900/50"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-stone-300 text-[10px] font-semibold text-stone-500 dark:border-stone-600 dark:text-stone-400">
                  {itemIndex + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{item.title}</p>
                  <p className="text-sm leading-6 text-stone-600 dark:text-stone-400">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )
    }

    if (section.kind === 'templates') {
      return (
        <section key={section.id} id={section.id} className={cn(cardCls, 'scroll-mt-24')}>
          {heading}
          <div className="space-y-4">
            {section.templates.map((template) => (
              <article
                key={template.name}
                className="rounded-[18px] border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/50"
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {template.name}
                  </h3>
                  <span className="text-[11px] text-stone-400 dark:text-stone-500">{template.meta}</span>
                </div>
                <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">{template.purpose}</p>

                <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[14px] border border-stone-200 bg-white p-3 font-ui text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                  {template.prompt}
                </pre>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5 px-3 text-xs"
                    onClick={() => void copyPrompt(template.prompt)}
                  >
                    {copiedPrompt === template.prompt ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    )}
                    {copiedPrompt === template.prompt ? content.copied : content.copyPrompt}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 px-3 text-xs"
                    onClick={() => useTemplate(template.prompt, template.mode)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {content.useTemplate}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )
    }

    if (section.kind === 'diagnosis') {
      return (
        <section key={section.id} id={section.id} className={cn(cardCls, 'scroll-mt-24')}>
          {heading}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800">
                  <th className="w-[26%] pb-2 pr-3 text-xs font-medium text-stone-400 dark:text-stone-500">
                    {content.diagnosisHeaders.symptom}
                  </th>
                  <th className="w-[30%] pb-2 pr-3 text-xs font-medium text-stone-400 dark:text-stone-500">
                    {content.diagnosisHeaders.cause}
                  </th>
                  <th className="pb-2 text-xs font-medium text-stone-400 dark:text-stone-500">
                    {content.diagnosisHeaders.fix}
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr
                    key={row.symptom}
                    className="border-b border-stone-100 last:border-0 dark:border-stone-800/70"
                  >
                    <td className="py-3 pr-3 align-top font-medium text-stone-900 dark:text-stone-100">
                      {row.symptom}
                    </td>
                    <td className="py-3 pr-3 align-top text-stone-500 dark:text-stone-400">
                      {row.cause}
                    </td>
                    <td className="py-3 align-top leading-6 text-stone-600 dark:text-stone-300">
                      {row.fix}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )
    }

    return (
      <section key={section.id} id={section.id} className={cn(cardCls, 'scroll-mt-24')}>
        {heading}
        <ul className="space-y-2">
          {section.checks.map((check) => (
            <li key={check} className="flex items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="leading-6">{check}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <PageTransition className="min-h-screen bg-canvas text-stone-950 dark:bg-canvas-dark dark:text-white">
      <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6 md:pt-8">
        <header className="mb-6 md:mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.25em] text-aurora-purple">
            {content.kicker}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white md:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">
            {content.subtitle}
          </p>
          <Button className="mt-5 gap-2" onClick={() => router.push(`/${locale}/create`)}>
            <Sparkles className="h-4 w-4" />
            {content.goCreate}
          </Button>
        </header>

        <nav className="mb-6 rounded-[20px] border border-stone-200 bg-white/80 p-4 dark:border-stone-800 dark:bg-stone-950/80">
          <p className="mb-2.5 text-xs font-medium text-stone-400 dark:text-stone-500">
            {content.tocLabel}
          </p>
          <ol className="flex flex-wrap gap-2">
            {content.sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:text-stone-100"
                >
                  <span className="text-stone-400 dark:text-stone-500">{index + 1}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-5">
          {content.sections.map((section, index) => renderSection(section, index))}
        </div>
      </div>
    </PageTransition>
  )
}
