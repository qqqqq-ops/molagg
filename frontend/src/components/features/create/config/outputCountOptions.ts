/**
 * 「一次生成几条」的可选数量，按模型给。
 *
 * **后端的模型能力里没有这个字段**（`ModelLimits` 只有 maxInputImages 这类输入限制），
 * 所以这是一张前端表。它表达的不是「模型技术上能不能」——
 * 这个仓库里出 N 条本来就是**并发提交 N 个任务**（见 landingGenerate 的注释
 * 「图片厂商一次只出一张，多张就是并发提交多个任务」），任何模型给几条都跑得通。
 *
 * 这张表表达的是「给几条才合理」：
 * - Midjourney 一个任务本来就返回四宫格，再乘 4 就是 16 张，没必要。
 * - 视频又慢又贵，一次给太多选项容易手滑烧钱。
 * - 图片便宜快，多出几张挑一张是常规用法。
 *
 * 界面上解释这件事的那句话只给 key（`noteKey`），文案由调用方按当前语言查，
 * 这样这里还是个跟 React 无关的纯函数。
 */

const IMAGE_MAX = 4
const VIDEO_MAX = 2
const MIDJOURNEY_MAX = 1

export type OutputCountConfig = {
  options: number[]
  /** 解释为什么是这个范围的文案 key；没有特别理由时为 null */
  noteKey: 'midjourney' | 'video' | null
}

function normalize(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

export function getOutputCountConfig(
  provider: string | undefined,
  mode: 'image' | 'video',
): OutputCountConfig {
  const normalized = normalize(provider)

  if (normalized.includes('midjourney') || normalized === 'mj') {
    return { options: [MIDJOURNEY_MAX], noteKey: 'midjourney' }
  }

  if (mode === 'video') {
    return {
      options: Array.from({ length: VIDEO_MAX }, (_, index) => index + 1),
      noteKey: 'video',
    }
  }

  return {
    options: Array.from({ length: IMAGE_MAX }, (_, index) => index + 1),
    noteKey: null,
  }
}

/** 换模型后原来选的数量可能超出新模型的范围，夹回去 */
export function clampOutputCount(count: number, config: OutputCountConfig) {
  const max = config.options[config.options.length - 1] ?? 1
  if (!Number.isFinite(count) || count < 1) return 1
  return Math.min(Math.round(count), max)
}
