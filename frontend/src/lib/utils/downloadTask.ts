import type { ApiTask } from '@/lib/api/types/task'

/**
 * 下载任务结果：先 fetch 成 blob（同源或配了 CORS 的资源能直接存），
 * 不行就退回直链（新标签页打开由浏览器处理），再不行提示手动保存。
 * 任务卡片和任务队列列表共用。
 */
export async function downloadTaskResult(task: Pick<ApiTask, 'type' | 'taskNo' | 'resultUrl'>) {
  if (!task.resultUrl) return

  try {
    // 获取文件扩展名
    const fileExt = task.type === 'image' ? 'png' : 'mp4'
    const fileName = `flowmuse_${task.taskNo}_${Date.now()}.${fileExt}`

    // 尝试通过 fetch 下载（支持同源或配置了 CORS 的资源）
    try {
      const response = await fetch(task.resultUrl)
      if (!response.ok) throw new Error('Failed to fetch')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (fetchError) {
      // 如果 fetch 失败（CORS 问题），使用直接链接方式
      console.log('Fetch failed, trying direct link download:', fetchError)
      const a = document.createElement('a')
      a.href = task.resultUrl
      a.download = fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  } catch (err) {
    console.error('Failed to download:', err)
    alert('下载失败，请在新标签页中打开并手动保存')
    // 最后的备选方案：在新标签页中打开
    window.open(task.resultUrl, '_blank', 'noopener,noreferrer')
  }
}
