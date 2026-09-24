/**
 * 登录页模型展示的**离线兜底**数据。
 *
 * 正常情况下登录页直接拉 GET /api/models（免登录可访问），
 * 展示的就是这台机器上真实启用的模型 —— 你在后台增删模型，登录页会自己跟上。
 * 只有在后端没起来或请求失败时，才回落到下面这份快照。
 *
 * 快照由 prisma/default-ai-models.json 生成，不要手改；
 * 上游内置清单变了就重新生成。
 */

export type ShowcaseModel = {
  name: string
  type: 'image' | 'video' | 'chat'
  /** 完整路径，与 GET /models 返回的 icon 字段一致 */
  icon: string
  /** 内置描述，没有的模型不参与侧栏轮播 */
  desc: string | null
  /** 归并后的厂商 key，用于「一家只显示一个」 */
  vendorKey?: string
  /** 没有图标资源时显示的字母牌 */
  monogram?: string
}

export const FALLBACK_MODELS: ShowcaseModel[] = [
  { name: "NanoBanana", type: 'image', icon: "/model-icons/nanobanana.svg", desc: "具备图像生成和对话式多轮编辑功能，专为快速创意工作流程而优化。" , vendorKey: "google-gemini" },
  { name: "Nano Banana Pro", type: 'image', icon: "/model-icons/nano-banana-pro.svg", desc: "Nano Banana pro是Google Gemini系列中的下一代AI图像生成与编辑模型,是G…" , vendorKey: "google-gemini" },
  { name: "Midjourney", type: 'image', icon: "/model-icons/midjourney.svg", desc: null , vendorKey: "midjourney" },
  { name: "Seedream 4.5", type: 'image', icon: "/model-icons/doubao.svg", desc: "Seedream 4.5 原生支持文本、单图和多图输入，实现基于主体一致性的多图融合创作、图像编辑…" , vendorKey: "bytedance" },
  { name: "NanoBanana 2", type: 'image', icon: "/model-icons/nanobanana-2.svg", desc: "Nano Banana 2 以主流价格提供高质量的图片生成和对话式编辑功能，延迟时间短。" , vendorKey: "google-gemini" },
  { name: "Seedream 5.0 Lite", type: 'image', icon: "/model-icons/doubao.svg", desc: null , vendorKey: "bytedance" },
  { name: "Qwen Image 2.0 Pro", type: 'image', icon: "/model-icons/qwen.svg", desc: null , vendorKey: "alibaba" },
  { name: "万相 2.7 Image", type: 'image', icon: "/model-icons/wanx.svg", desc: "万相2.7-图像生成与编辑，支持文生图、文生组图、图生组图、图像编辑、多图参考生成、交互式编辑，在文…" , vendorKey: "alibaba" },
  { name: "Seedance 2.0", type: 'video', icon: "/model-icons/doubao.svg", desc: null , vendorKey: "bytedance" },
  { name: "Seedance 2.0 Fast", type: 'video', icon: "/model-icons/doubao.svg", desc: null , vendorKey: "bytedance" },
  { name: "万相2.7-图生视频", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "万相2.7 文生视频", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "万相2.7 Video", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "HappyHorse 1.0", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "HappyHorse 1.0 文生视频", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "HappyHorse 1.0 图生视频", type: 'video', icon: "/model-icons/wanx.svg", desc: null , vendorKey: "alibaba" },
  { name: "Seedance 2.5", type: 'video', icon: "/model-icons/doubao.svg", desc: "字节跳动新一代视频模型，单次最长 30 秒，支持最多 30 张参考图、10 段参考视频和 10 段参…" , vendorKey: "bytedance" },
  { name: "Seedance 2.0 Mini", type: 'video', icon: "/model-icons/doubao.svg", desc: "Seedance 2.0 轻量版，速度快、成本低，同样支持多模态参考。" , vendorKey: "bytedance" },
  { name: "可灵 2.6", type: 'video', icon: "/model-icons/kling.svg", desc: "快手可灵 2.6，支持文生视频、图生视频和有声视频。" , vendorKey: "kuaishou" },
  { name: "可灵 O1", type: 'video', icon: "/model-icons/kling.svg", desc: "可灵 Omni 多模态视频模型，支持参考图、首尾帧和视频编辑。" , vendorKey: "kuaishou" },
  { name: "Sora 2", type: 'video', icon: "/model-icons/sora.svg", desc: "OpenAI Sora 2，走 /v1/videos 异步视频接口。" , vendorKey: "openai" },
  { name: "Sora 2 Pro", type: 'video', icon: "/model-icons/sora.svg", desc: "Sora 2 专业版，支持更高分辨率导出。" , vendorKey: "openai" },
  { name: "Veo 3.1", type: 'video', icon: "/model-icons/veo.svg", desc: "Google Veo 3.1，走主流中转站 /v1/videos/generations 格式。" , vendorKey: "google" },
  { name: "Veo 3.1 Fast", type: 'video', icon: "/model-icons/veo.svg", desc: "Veo 3.1 快速版。" , vendorKey: "google" },
  { name: "海螺 2.3", type: 'video', icon: "/model-icons/hailuo.svg", desc: "MiniMax 海螺视频，走 /v1/video_generation 格式。" , vendorKey: "minimax" },
  { name: "可灵 3.0 Omni", type: 'video', icon: "/model-icons/kling.svg", desc: "可灵 3.0 Omni，3–15 秒，支持多镜头、视频编辑和原生音频。" , vendorKey: "kuaishou" },
  { name: "可灵 3.0", type: 'video', icon: "/model-icons/kling.svg", desc: "可灵 3.0，3–15 秒，支持 1080P/4K 和原生音频。" , vendorKey: "kuaishou" },
  { name: "万相 3.0 Video", type: 'video', icon: "/model-icons/wanx.svg", desc: "阿里万相 3.0 参考生视频，最长 30 秒，走通义万相格式。" , vendorKey: "alibaba" },
  { name: "万相 3.0 文生视频", type: 'video', icon: "/model-icons/wanx.svg", desc: "阿里万相 3.0 文生视频。" , vendorKey: "alibaba" },
  { name: "Gemini Omni Flash", type: 'video', icon: "/model-icons/veo.svg", desc: "Google Gemini Omni Flash，当前文生视频榜前列，走 Veo /v1/video…" , vendorKey: "google" },
  { name: "MiniMax H3", type: 'video', icon: "/model-icons/hailuo.svg", desc: "MiniMax H3，4–15 秒，768P/2K，原生立体声。" , vendorKey: "minimax" },
  { name: "Vidu Q1", type: 'video', icon: "/model-icons/vidu.svg", desc: "生数 Vidu Q1，走 /ent/v2 文生视频 / 图生视频格式。" , vendorKey: "vidu" },
  { name: "GPT Image 2", type: 'image', icon: "/model-icons/gpt-image.svg", desc: null , vendorKey: "openai" },
]

/** 只有带描述的模型才能进侧栏轮播 —— 没描述的卡片是空的 */
export function pickSpotlightModels(models: ShowcaseModel[]) {
  return models.filter((model): model is ShowcaseModel & { desc: string } => Boolean(model.desc))
}
