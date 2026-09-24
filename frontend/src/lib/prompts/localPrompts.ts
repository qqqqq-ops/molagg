import type { Prompt } from '@/lib/types/prompt'

type NetworkPromptType = 'image' | 'video'

const LOCAL_IMAGE_PROMPTS_URL = '/json/prompts.json'
const LOCAL_VIDEO_PROMPTS_URL = '/json/prompts-videos.json'

/**
 * 离线兜底的图片提示词：/json/prompts.json 拿不到时用这份。
 * 内容从那份文件里每个分类取第一条，两边保持同一套风格。
 * 全部是 mode: 'generate' —— 套用提示词时不会带参考图（applyNetworkPrompt 只填 prompt），
 * 所以「参考图中的…」这类需要垫图的提示词放进来会变成死路。
 */
export const LOCAL_NETWORK_PROMPTS: Prompt[] = [
  {
    title: '侧光人物特写',
    preview: '',
    prompt:
      '单侧硬光打在面部，鼻影清晰可见，深色背景，85mm 定焦，浅景深，皮肤保留毛孔与细小纹理，低调摄影。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '人像',
    sub_category: '',
    created: '2026-09-21',
  },
  {
    title: '深色台面香水瓶',
    preview: '',
    prompt:
      '黑色镜面台面上的玻璃香水瓶，一束硬光从左侧扫过瓶身，反射干净，极简构图，浅景深。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '商品',
    sub_category: '',
    created: '2026-09-21',
  },
  {
    title: '云海日出古亭',
    preview: '',
    prompt:
      '云海之上的古亭，远山层叠，日出暖光穿透雾气，水墨笔触与写实光影结合，宽幅构图。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '风景',
    sub_category: '',
    created: '2026-09-21',
  },
  {
    title: '扁平几何插画',
    preview: '',
    prompt:
      '扁平几何风格插画，一只猫坐在窗台上看城市天际线，低饱和配色，粗颗粒纸张质感，构图干净。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '插画',
    sub_category: '',
    created: '2026-09-21',
  },
  {
    title: '极简文字海报',
    preview: '',
    prompt:
      '极简排版海报，大面积留白，单一衬线大标题居中，底部一行细小说明文字，米白纸张底色。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '设计',
    sub_category: '',
    created: '2026-09-21',
  },
  {
    title: '微缩世界',
    preview: '',
    prompt:
      '微缩模型视角，小人在键盘上修理按键，微距浅景深，柔和台灯照明，超现实的日常感。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: '创意',
    sub_category: '',
    created: '2026-09-21',
  },
]

export const LOCAL_VIDEO_NETWORK_PROMPTS: Prompt[] = [
  {
    title: '雨夜赛博朋克街头推镜',
    preview: '',
    prompt:
      '8秒，16:9。雨夜赛博朋克街头，霓虹招牌倒映在湿漉漉的柏油路上，一名穿黑色长风衣的人撑伞缓慢前行。镜头从远景缓慢推入中景，雨滴与地面积水产生真实反射，背景有轻微车流光轨。电影级构图，青紫色霓虹，高对比，轻微胶片颗粒。无文字，无水印，人物比例稳定。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: 'Seedance 2.5',
    sub_category: 'seedance-2-5',
    created: '2026-04-26',
  },
  {
    title: '高端香水 360° 产品广告',
    preview: '',
    prompt:
      '使用参考图中的香水瓶作为唯一产品主体，6秒高端产品广告。香水瓶放置在黑色镜面亚克力台面上，瓶身缓慢 360 度旋转，周围有轻薄雾气和金色轮廓光。镜头固定在产品正前方，轻微推近，强调玻璃折射、液体质感和瓶盖金属高光。奢侈品广告质感，干净背景，无文字，无水印，产品外形保持一致。',
    author: 'Molagg',
    link: '',
    mode: 'generate',
    category: 'Seedance 2.0',
    sub_category: 'seedance-2-0-260128',
    created: '2026-04-26',
  },
]

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeMode(value: unknown): Prompt['mode'] {
  return value === 'edit' ? 'edit' : 'generate'
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const urls = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return urls.length > 0 ? urls : undefined
}

function normalizePrompt(value: unknown): Prompt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const prompt = readString(row.prompt).trim()
  if (!prompt) return null

  const title = readString(row.title).trim() || prompt.slice(0, 32)
  const category = readString(row.category).trim() || '默认'

  return {
    title,
    preview: readString(row.preview).trim(),
    reference_image_urls: normalizeStringArray(row.reference_image_urls),
    prompt,
    author: readString(row.author).trim() || 'Molagg',
    link: readString(row.link).trim(),
    mode: normalizeMode(row.mode),
    category,
    sub_category: readString(row.sub_category).trim(),
    created: readString(row.created).trim() || new Date(0).toISOString(),
  }
}

function normalizePromptPayload(value: unknown) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { prompts?: unknown }).prompts)
      ? (value as { prompts: unknown[] }).prompts
      : []

  return rows.map(normalizePrompt).filter((item): item is Prompt => item !== null)
}

function normalizeVideoPrompt(value: unknown, fallbackCreated: string): Prompt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const seedance = row.seedance && typeof row.seedance === 'object' && !Array.isArray(row.seedance)
    ? row.seedance as Record<string, unknown>
    : {}
  const source = row.source && typeof row.source === 'object' && !Array.isArray(row.source)
    ? row.source as Record<string, unknown>
    : {}
  const preview = row.preview && typeof row.preview === 'object' && !Array.isArray(row.preview)
    ? row.preview as Record<string, unknown>
    : {}

  const prompt = readString(seedance.prompt).trim()
  if (!prompt) return null

  const title = readString(row.title).trim() || prompt.slice(0, 32)
  const category = readString(row.category).trim() || 'video'
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const modelHint = tags[0] || readString(source.inspired_by).trim() || 'seedance'

  return {
    title,
    preview: readString(preview.thumbnail_url).trim(),
    prompt,
    author: readString(source.inspired_by).trim() || 'Molagg',
    link: readString(source.url).trim(),
    mode: 'generate',
    category,
    sub_category: modelHint,
    created: fallbackCreated,
  }
}

function normalizeVideoPromptPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const payload = value as Record<string, unknown>
  const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? payload.meta as Record<string, unknown>
    : {}
  const fallbackCreated = readString(meta.created_at).trim() || new Date(0).toISOString()
  const rows = Array.isArray(payload.templates) ? payload.templates : []

  return rows.map((row) => normalizeVideoPrompt(row, fallbackCreated)).filter((item): item is Prompt => item !== null)
}

export async function loadNetworkPrompts(type: NetworkPromptType = 'image') {
  const url = type === 'video' ? LOCAL_VIDEO_PROMPTS_URL : LOCAL_IMAGE_PROMPTS_URL
  const fallback = type === 'video' ? LOCAL_VIDEO_NETWORK_PROMPTS : LOCAL_NETWORK_PROMPTS

  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to load local ${type} prompts: ${response.status}`)
    }

    const prompts = type === 'video'
      ? normalizeVideoPromptPayload(await response.json())
      : normalizePromptPayload(await response.json())
    return prompts.length > 0 ? prompts : fallback
  } catch (error) {
    console.error(`[Prompts] Failed to load local ${type} prompts JSON:`, error)
    return fallback
  }
}
