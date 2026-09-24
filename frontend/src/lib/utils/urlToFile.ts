/**
 * 把一个地址（远程 URL 或 data URL）下载成 File。
 *
 * 为什么要 File：上传组件和 buildLandingParameters 吃的都是 File[]，
 * 而画布里的素材节点、「生成这一帧」拿到的都是地址。
 *
 * 远程地址没有 CORS 头时 fetch 会失败，调用方要处理（画布里会提示这张图用不了）。
 */
export async function urlToFile(url: string, filename: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载素材失败：${response.status}`)
  const blob = await response.blob()
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
  return new File([blob], `${filename}.${extension}`, { type: blob.type || 'image/jpeg' })
}
