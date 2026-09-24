/**
 * 斜杠命令 /light、/angle：在搜索框里敲，一步建好一小段工作流。
 *
 * - 先选中一张图再敲：建一个图片生成器，把那张图连进去当参考，打光 / 角度已经勾好；
 * - 什么都没选：建一个文字节点，里面是对应的提示词，用户自己连到生成器上。
 *
 * 这里只描述「建什么」，不碰 store；名字和提示语走 i18n（canvas.slash.*）。
 * 文字节点里的内容是要发给模型的，照 shotOptions 的规矩一律英文。
 */

import {
  CHARACTER_ANGLES,
  LIGHTING_PRESETS,
  LIGHT_POSITIONS,
  buildShotPrompt,
  LIGHT_BRIGHTNESS,
  LIGHT_COLORS,
} from './shotOptions'

export type SlashCommandKey = 'light' | 'angle'

export const SLASH_COMMANDS: { key: SlashCommandKey; command: string }[] = [
  { key: 'light', command: '/light' },
  { key: 'angle', command: '/angle' },
]

/** /light 默认用三点布光；用户建好后还能在节点上改 */
const LIGHT_PRESET_KEY = 'three-point'
/** /angle 默认出这四个角度：正面、左右侧、背面——做角色设定最常用的一组 */
export const DEFAULT_ANGLE_KEYS = ['front', 'left', 'right', 'back']

/** 敲了一半也能匹配：「/li」→ light */
export function matchSlashCommands(query: string) {
  const q = query.trim().toLowerCase()
  if (!q.startsWith('/')) return []
  return SLASH_COMMANDS.filter((item) => item.command.startsWith(q.split(/\s+/)[0]))
}

/** 选中图片时要建的生成器配置 */
export function slashGeneratorData(key: SlashCommandKey): Record<string, unknown> {
  if (key === 'angle') return { angleKeys: [...DEFAULT_ANGLE_KEYS] }
  const preset = LIGHTING_PRESETS.find((item) => item.key === LIGHT_PRESET_KEY)!
  return {
    lightingPresetKey: preset.key,
    lightPositionKeys: [...preset.positions],
    lightColorKey: preset.defaultColor,
    lightBrightnessKey: preset.defaultBrightness,
  }
}

/** 选中图片时，提示里要说「几个灯位 / 几个视角」 */
export function slashGeneratorCount(key: SlashCommandKey) {
  if (key === 'angle') return DEFAULT_ANGLE_KEYS.length
  return LIGHTING_PRESETS.find((item) => item.key === LIGHT_PRESET_KEY)!.positions.length
}

/** 什么都没选时，文字节点里放的提示词（英文，直接复用选项里的提示词片段） */
export function slashTextPrompt(key: SlashCommandKey) {
  if (key === 'angle') {
    return [
      'character turnaround sheet, same character shown from several angles, consistent design',
      buildShotPrompt([{ list: CHARACTER_ANGLES, keys: DEFAULT_ANGLE_KEYS }]),
    ].join(', ')
  }
  const preset = LIGHTING_PRESETS.find((item) => item.key === LIGHT_PRESET_KEY)!
  return buildShotPrompt([
    { list: LIGHT_POSITIONS, keys: preset.positions },
    { list: LIGHT_COLORS, keys: [preset.defaultColor] },
    { list: LIGHT_BRIGHTNESS, keys: [preset.defaultBrightness] },
  ])
}
