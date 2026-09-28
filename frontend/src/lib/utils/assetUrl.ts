/**
 * 上传/生成结果地址的同源归一化。
 *
 * 后端把本地上传结果存成**绝对**地址 `http://<host>/uploads/...`（见 `storage.service#toObjectUrl`，用 `APP_PUBLIC_URL` 拼）。
 * 那个绝对地址对「将来上公网、把上传图当公网参考图发给上游」有用，但对「在本站显示」是坑：
 * 只要前端不在同一个 host（开发走 3001 代理、部署到域名、换设备访问、经代理），跨源就加载失败——
 * 图片裂、视频显示打叉的播放键。
 *
 * 这里把凡是指向 `/uploads/` 的**绝对**地址剥成**相对** `/uploads/...`，跟着当前站点走 = 同源，谁访问都对
 * （后端直接服务 /uploads，前端 serve-dist 也把 /uploads 代理到后端）。
 * 只认 `/uploads/` 路径：COS 等真正的公网直链（别的 host、别的路径）原样保留；`blob:` / `data:` 本地预览也原样保留。
 */
export function toSameOriginAsset<T extends string | null | undefined>(url: T): T {
  if (typeof url !== 'string') return url
  return url.replace(/^https?:\/\/[^/]+(\/uploads\/)/i, '$1') as T
}

/**
 * 发给上游、要上游自己去下载的地址（Molagg 参考图）：必须是完整的公网地址。
 * 先按上面归一成相对 `/uploads/...`，再补上当前站点的域名——这样后端 APP_PUBLIC_URL 没配好（还是 localhost）也不怕。
 * 在本机访问时补出来的还是 localhost，上游下载不到，后端会直接报「参考图必须是公网地址」。
 */
export function toPublicAssetUrl(url: string): string {
  const sameOrigin = toSameOriginAsset(url)
  return sameOrigin.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${sameOrigin}` : sameOrigin
}
