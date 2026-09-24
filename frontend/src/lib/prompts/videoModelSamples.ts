export type VideoModelSample = {
  id: string
  title: string
  tag: string
  prompt: string
  modelKeyIncludes: string[]
  duration: string
  ratio: string
}

export const VIDEO_MODEL_SAMPLES: VideoModelSample[] = [
  {
    id: 'seedance-25-story',
    title: '海边故事',
    tag: 'Seedance 2.5',
    modelKeyIncludes: ['seedance-2-5'],
    duration: '10',
    ratio: '16:9',
    prompt:
      '黄昏海边，一位穿亚麻衬衫的女孩赤脚走过湿沙滩，镜头从远景缓缓推近到侧脸特写。风吹起头发，远处有渔船灯火。电影感暖色调，镜头稳定，10秒内完成远到近的叙事。',
  },
  {
    id: 'seedance-20-product',
    title: '产品广告',
    tag: 'Seedance 2.0',
    modelKeyIncludes: ['seedance-2-0-260128'],
    duration: '8',
    ratio: '16:9',
    prompt:
      '黑色大理石台面上的玻璃香水瓶，一束光从左侧扫过瓶身，液体里有细小气泡缓缓上升。镜头环绕半圈，高端广告质感，浅景深，8秒。',
  },
  {
    id: 'kling-30-motion',
    title: '人物动作',
    tag: '可灵 3.0',
    modelKeyIncludes: ['kling-v3'],
    duration: '5',
    ratio: '9:16',
    prompt:
      '年轻舞者在雨后霓虹巷子里转身起跳，水花溅起，镜头低角度跟随。竖屏短视频，动作利落，光影鲜明，5秒。',
  },
  {
    id: 'wan-30-landscape',
    title: '山水空镜',
    tag: '万相 3.0',
    modelKeyIncludes: ['wan3.0'],
    duration: '8',
    ratio: '16:9',
    prompt:
      '云海之上的雪山日出，金色阳光从云层缝隙洒下，镜头缓慢横移。写实风光，空气通透，适合空镜，8秒。',
  },
  {
    id: 'omni-cinematic',
    title: '电影镜头',
    tag: 'Gemini Omni',
    modelKeyIncludes: ['gemini-omni', 'veo-3.1'],
    duration: '8',
    ratio: '16:9',
    prompt:
      '夜晚的东京十字路口，行人撑伞走过斑马线，霓虹倒映在湿地面。镜头从高处缓缓下降，电影宽银幕构图，真实城市氛围，8秒。',
  },
  {
    id: 'h3-portrait',
    title: '人物特写',
    tag: 'MiniMax H3',
    modelKeyIncludes: ['minimax-h3', 'hailuo'],
    duration: '6',
    ratio: '9:16',
    prompt:
      '咖啡馆窗边的女孩抬头看向窗外，暖色灯光打在侧脸上，她轻轻微笑。镜头缓慢推向眼睛，自然微表情，竖屏，6秒。',
  },
]

export function findSampleModelId<T extends { id: string; modelKey?: string | null; name?: string | null }>(
  models: T[],
  sample: VideoModelSample,
): string | null {
  const needles = sample.modelKeyIncludes.map((item) => item.toLowerCase())
  const matched = models.find((model) => {
    const haystack = `${model.modelKey ?? ''} ${model.name ?? ''}`.toLowerCase()
    return needles.some((needle) => haystack.includes(needle))
  })
  return matched?.id ?? null
}
