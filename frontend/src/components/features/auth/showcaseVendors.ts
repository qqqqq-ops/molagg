/**
 * 登录页模型球的厂商归并规则。
 *
 * 目标：一家厂商只出现一个图标，取它最新的那个模型。
 * 之所以需要这张表，是因为：
 * 1. 同一家厂商在 ai_models 里可能有多个 provider（qwen 和 wanx 都是阿里）；
 * 2. 仓库里的 model-icons 有重复文件（qwen.svg 与 wanx.svg 字节相同，
 *    三个 nanobanana 也是同一个文件），光按 provider 去重仍会出现相同图标；
 * 3. 文本模型（chatModelCatalog）没有图标资源，需要单独给兜底。
 */

/** provider → 归并后的厂商 key。表里没有的按 provider 自身算一家。 */
export const PROVIDER_TO_VENDOR: Record<string, string> = {
  doubao: 'bytedance',
  qwen: 'alibaba',
  wanx: 'alibaba',
  veo: 'google',
  nanobanana: 'google-gemini',
  gptimage: 'openai',
  sora: 'openai',
  hailuo: 'minimax',
  kling: 'kuaishou',
  mj: 'midjourney',
  vidu: 'vidu',
}

/** 内置文本模型清单里的厂商名 → 同一套厂商 key */
export const CATALOG_VENDOR_TO_KEY: Record<string, string> = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  Google: 'google',
  xAI: 'xai',
  DeepSeek: 'deepseek',
  阿里通义: 'alibaba',
  字节豆包: 'bytedance',
  智谱: 'zhipu',
  月之暗面: 'moonshot',
  MiniMax: 'minimax',
  腾讯混元: 'tencent',
}

/**
 * 厂商 logo。文件在 public/model-icons/vendors/，来自 Simple Icons（CC0）。
 * 这里优先于 provider 自带的产品图标使用，保证「一家厂商一个 logo」。
 */
export const VENDOR_ICON: Record<string, string> = {
  openai: '/model-icons/vendors/openai.svg',
  // 挂的是 Claude 本体的星芒标，不是 Anthropic 的 A 字企业标 ——
  // 球上显示的是「Claude Fable」，给企业标会认不出来
  anthropic: '/model-icons/vendors/claude.svg',
  google: '/model-icons/vendors/google.svg',
  // Simple Icons 至今没收录 xAI，这个文件取自 svgl 的官方轨迹。
  // 注意别换回 Simple Icons 的 x.svg —— 那是推特的 X，和 Grok 没关系
  xai: '/model-icons/vendors/xai.svg',
  deepseek: '/model-icons/vendors/deepseek.svg',
  // 文件名是 alibaba，内容是 Qwen 的标：球上显示的是「Qwen 3.7 Max」，
  // 给「阿里云」企业标对不上
  alibaba: '/model-icons/vendors/alibaba.svg',
  minimax: '/model-icons/vendors/minimax.svg',
  moonshot: '/model-icons/vendors/moonshot.svg',
  bytedance: '/model-icons/vendors/bytedance.svg',
  kuaishou: '/model-icons/vendors/kuaishou.svg',
  tencent: '/model-icons/vendors/tencent.svg',
}

/**
 * Simple Icons 没有收录的厂商用字母牌兜底。
 * 不拿别家的图标顶替 —— 那比没有图标更误导人。
 */
export const VENDOR_MONOGRAM: Record<string, string> = {
  zhipu: 'GLM',
}

export const VENDOR_DISPLAY_NAME: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  alibaba: '阿里通义',
  bytedance: '字节跳动',
  kuaishou: '快手可灵',
  minimax: 'MiniMax',
  moonshot: '月之暗面',
  zhipu: '智谱 GLM',
  tencent: '腾讯混元',
}

export function vendorKeyForProvider(provider: string) {
  return PROVIDER_TO_VENDOR[provider] ?? provider
}
