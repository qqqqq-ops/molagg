/**
 * 镜头 / 打光 / 视角选项集（照参考站 canvas-v2 的口径）。
 *
 * 这里**只存 key 和英文 `promptFragment`**，界面上的名字走 i18n（canvas.shot.*）。
 * 两者性质不同，不能混：
 * - `promptFragment` 是发给模型的提示词内容，无论界面是中文还是英文都发英文
 *   （上游模型对中文方位词的理解参差不齐）；
 * - 名字是给人看的，跟着站点语言走。
 */

export type ShotOption = {
  key: string
  /** 拼进提示词的英文片段 */
  promptFragment: string
}

/** 界面上用的选项：i18n 解析后由组件拼出来喂给 ChipGroup */
export type ShotChoice = {
  key: string
  label: string
  description?: string
  swatch?: string
}

/** 打光位置：可多选，一次打光可以同时有主光 + 辅光 + 轮廓光 */
export const LIGHT_POSITIONS: ShotOption[] = [
  { key: 'key', promptFragment: 'main key light from front-left, primary illumination' },
  { key: 'fill', promptFragment: 'soft fill light from front-right, reduces shadows' },
  { key: 'rim', promptFragment: 'rim light from behind subject, edge separation' },
  { key: 'back', promptFragment: 'background light, environment ambience' },
  { key: 'top', promptFragment: 'top light overhead, vertical falloff' },
  { key: 'bottom', promptFragment: 'low underlighting from below, dramatic upward shadows' },
]

/** 光的软硬 */
export const LIGHT_BRIGHTNESS: ShotOption[] = [
  { key: 'soft', promptFragment: 'soft diffused lighting, low contrast' },
  { key: 'normal', promptFragment: 'balanced exposure, natural contrast' },
  { key: 'hard', promptFragment: 'hard directional light, high contrast, sharp shadows' },
]

/** 色温 / 色调，`swatch` 是界面上那个小色块——颜色不是文案，不进 i18n */
export const LIGHT_COLORS: (ShotOption & { swatch: string })[] = [
  { key: 'neutral', swatch: '#f5f5f4', promptFragment: 'neutral white balance, daylight 5500K' },
  { key: 'warm', swatch: '#f0b866', promptFragment: 'warm tungsten light, 3200K' },
  { key: 'cool', swatch: '#8fb8e0', promptFragment: 'cool blue tint, 7000K overcast' },
  { key: 'golden', swatch: '#d99b45', promptFragment: 'golden hour warm sunlight, 2800K' },
  { key: 'blue-hour', swatch: '#4a6fa5', promptFragment: 'blue hour ambient, deep twilight tones' },
  { key: 'red-accent', swatch: '#c9524a', promptFragment: 'red accent gel light, dramatic highlight' },
]

/** 成套布光方案：选一个就把位置 / 色温 / 软硬一起填好 */
export type LightingPreset = {
  key: string
  positions: string[]
  defaultColor: string
  defaultBrightness: string
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  { key: 'three-point', positions: ['key', 'fill', 'rim'], defaultColor: 'neutral', defaultBrightness: 'normal' },
  { key: 'rembrandt', positions: ['key'], defaultColor: 'warm', defaultBrightness: 'hard' },
  { key: 'split', positions: ['key'], defaultColor: 'cool', defaultBrightness: 'hard' },
  { key: 'butterfly', positions: ['top', 'fill'], defaultColor: 'neutral', defaultBrightness: 'soft' },
  { key: 'silhouette', positions: ['back'], defaultColor: 'golden', defaultBrightness: 'hard' },
  { key: 'natural', positions: ['key', 'back'], defaultColor: 'neutral', defaultBrightness: 'soft' },
]

/** 角色朝向：多角度生成就是把这几个各出一张 */
export const CHARACTER_ANGLES: ShotOption[] = [
  { key: 'front', promptFragment: 'front view, facing camera, centered composition' },
  { key: 'back', promptFragment: 'back view, facing away from camera, rear shot' },
  { key: 'left', promptFragment: 'left profile view, side angle, character facing right' },
  { key: 'right', promptFragment: 'right profile view, side angle, character facing left' },
  { key: 'three-quarter-left', promptFragment: 'three-quarter view from left, dynamic angle, slight rotation' },
  { key: 'three-quarter-right', promptFragment: 'three-quarter view from right, dynamic angle, slight rotation' },
  { key: 'top-down', promptFragment: 'high angle view, top-down shot, looking down at subject' },
  { key: 'low-angle', promptFragment: 'low angle view, looking up at subject, heroic shot' },
  { key: 'birdseye', promptFragment: "bird's-eye view, directly overhead, top-down aerial angle" },
]

/** 机位高度 */
export const CAMERA_HEIGHTS: ShotOption[] = [
  { key: 'high', promptFragment: 'high-angle shot, camera positioned above looking down' },
  { key: 'eye', promptFragment: 'eye-level shot, neutral horizontal camera height' },
  { key: 'low', promptFragment: 'low-angle shot, camera positioned below looking up' },
]

/** 景别 */
export const SHOT_SIZES: ShotOption[] = [
  { key: 'closeup', promptFragment: 'close-up shot, tight framing on subject, detailed' },
  { key: 'medium', promptFragment: 'medium shot, waist-up framing' },
  { key: 'wide', promptFragment: 'wide shot, full body visible, environment context' },
]

const byKey = (list: ShotOption[]) => new Map(list.map((item) => [item.key, item]))

/**
 * 把勾选的选项拼成提示词后缀。
 * 同一个 key 在不同组里可能重名（比如 back 既是「背景光」又是「背面」），所以按组传进来，不做全局查表。
 */
export function buildShotPrompt(groups: { list: ShotOption[]; keys: string[] }[]) {
  const fragments: string[] = []
  for (const group of groups) {
    const lookup = byKey(group.list)
    for (const key of group.keys) {
      const fragment = lookup.get(key)?.promptFragment
      if (fragment && !fragments.includes(fragment)) fragments.push(fragment)
    }
  }
  return fragments.join(', ')
}
