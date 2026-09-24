/**
 * 内置素材库（照参考站 canvas-v2 的「提示词组 / 素材」）。
 *
 * 内置这批**不存名字**，界面上的名字走 i18n（canvas.snippets.items.<id>）；
 * `content` 是发给模型的英文提示词内容，跟界面语言无关，永远发英文。
 * 用户自己收藏的条目 `isBuiltin: false`、自带 `name`（用户打的字，不翻译），存在本地。
 */

export type PromptSnippetCategory = 'style' | 'quality' | 'mood' | 'composition' | 'camera' | 'negative' | 'custom'

export type PromptSnippet = {
  id: string
  /** 只有用户自己收藏的条目有；内置的按 id 查 i18n */
  name?: string
  category: PromptSnippetCategory
  /** 拼进提示词的英文内容 */
  content: string
  isBuiltin: boolean
}

export const BUILTIN_PROMPT_SNIPPETS: PromptSnippet[] = [
  // 风格
  { id: 'b-cinematic', category: 'style', isBuiltin: true, content: 'cinematic, dramatic lighting, film grain, color graded, shallow depth of field' },
  { id: 'b-photoreal', category: 'style', isBuiltin: true, content: 'hyperrealistic, photorealistic, 8K, ultra detailed, sharp focus' },
  { id: 'b-anime', category: 'style', isBuiltin: true, content: 'anime style, Studio Ghibli inspired, soft colors, hand-drawn lines' },
  { id: 'b-watercolor', category: 'style', isBuiltin: true, content: 'watercolor painting, hand-painted, soft brush strokes, paper texture' },

  // 画质
  { id: 'b-4k-hdr', category: 'quality', isBuiltin: true, content: '4K, HDR, high dynamic range, vivid colors' },
  { id: 'b-studio', category: 'quality', isBuiltin: true, content: 'studio lighting, professional photography, clean background, product shot' },
  { id: 'b-detail', category: 'quality', isBuiltin: true, content: 'highly detailed, intricate details, sharp focus, professional' },

  // 氛围
  { id: 'b-cozy', category: 'mood', isBuiltin: true, content: 'warm tones, soft lighting, cozy atmosphere, golden hour' },
  { id: 'b-tense', category: 'mood', isBuiltin: true, content: 'dramatic, high contrast, tense atmosphere, moody lighting' },

  // 构图
  { id: 'b-golden-ratio', category: 'composition', isBuiltin: true, content: 'golden ratio composition, rule of thirds, balanced framing' },
  { id: 'b-symmetric', category: 'composition', isBuiltin: true, content: 'symmetric composition, centered, balanced, mirror-like' },

  // 运镜（只对视频节点有意义，图片节点会隐藏这一组）
  { id: 'b-cam-push', category: 'camera', isBuiltin: true, content: 'slow dolly in, camera pushes toward the subject, building intimacy' },
  { id: 'b-cam-pull', category: 'camera', isBuiltin: true, content: 'dolly out, camera pulls back, revealing the surrounding environment' },
  { id: 'b-cam-pan', category: 'camera', isBuiltin: true, content: 'smooth pan, camera rotates horizontally across the scene' },
  { id: 'b-cam-track', category: 'camera', isBuiltin: true, content: 'tracking shot, camera moves laterally alongside the subject' },
  { id: 'b-cam-follow', category: 'camera', isBuiltin: true, content: 'follow shot, camera trails behind the moving subject' },
  { id: 'b-cam-crane-up', category: 'camera', isBuiltin: true, content: 'crane up, camera rises to reveal the scene from above' },
  { id: 'b-cam-crane-down', category: 'camera', isBuiltin: true, content: 'crane down, camera descends toward ground level' },
  { id: 'b-cam-orbit', category: 'camera', isBuiltin: true, content: 'orbit shot, camera circles 360 degrees around the subject' },
  { id: 'b-cam-handheld', category: 'camera', isBuiltin: true, content: 'handheld camera, subtle natural shake, documentary realism' },
  { id: 'b-cam-steadicam', category: 'camera', isBuiltin: true, content: 'steadicam follow, smooth gliding camera movement' },
  { id: 'b-cam-jib', category: 'camera', isBuiltin: true, content: 'jib arm sweep, fluid combined vertical and horizontal camera motion' },
  { id: 'b-cam-zoom-in', category: 'camera', isBuiltin: true, content: 'zoom in, focal length increases, compressing the depth of the scene' },
  { id: 'b-cam-zoom-out', category: 'camera', isBuiltin: true, content: 'zoom out, wide reveal, expanding the field of view' },
  { id: 'b-cam-dolly-zoom', category: 'camera', isBuiltin: true, content: 'dolly zoom, vertigo effect, background warps while the subject stays fixed' },
  { id: 'b-cam-high', category: 'camera', isBuiltin: true, content: 'high angle shot, camera looks down on the subject' },
  { id: 'b-cam-low', category: 'camera', isBuiltin: true, content: 'low angle shot, camera looks up, the subject appears powerful' },
  { id: 'b-cam-aerial', category: 'camera', isBuiltin: true, content: 'aerial top-down drone shot, birds-eye perspective' },
  { id: 'b-cam-whip', category: 'camera', isBuiltin: true, content: 'whip pan, fast motion-blur transition between subjects' },
  { id: 'b-cam-pov', category: 'camera', isBuiltin: true, content: 'first-person POV, camera acts as the subject eyes' },
  { id: 'b-cam-ots', category: 'camera', isBuiltin: true, content: 'over-the-shoulder shot, framing past one character toward another' },
  { id: 'b-cam-long-take', category: 'camera', isBuiltin: true, content: 'continuous long take, single unbroken camera move' },
  { id: 'b-cam-slow-push', category: 'camera', isBuiltin: true, content: 'slow creep into an extreme close-up, building tension' },

  // 负面词
  { id: 'b-negative', category: 'negative', isBuiltin: true, content: 'blurry, low quality, distorted, deformed, watermark, text, signature' },
]

export function groupSnippetsByCategory(snippets: PromptSnippet[]) {
  const groups = new Map<PromptSnippetCategory, PromptSnippet[]>()
  for (const snippet of snippets) {
    const list = groups.get(snippet.category) ?? []
    list.push(snippet)
    groups.set(snippet.category, list)
  }
  return groups
}

/** 勾选的素材拼成提示词；负面词单独拿出来，不能混进正向提示词 */
export function composeSnippetPrompt(snippets: PromptSnippet[], selectedIds: string[]) {
  const selected = selectedIds
    .map((id) => snippets.find((snippet) => snippet.id === id))
    .filter((snippet): snippet is PromptSnippet => Boolean(snippet))

  return {
    positive: selected.filter((s) => s.category !== 'negative').map((s) => s.content).join(', '),
    negative: selected.filter((s) => s.category === 'negative').map((s) => s.content).join(', '),
  }
}
