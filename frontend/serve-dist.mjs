import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.FRONTEND_PORT || process.env.PORT || 3001)
const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/**
 * 发静态文件，支持 Range（按段取）。
 * Safari / iPhone 播 mp4 必须能按段取，否则视频根本放不出来；Chrome 没有它也拖不了进度条。
 * 创作页的展示案例是 26MB 的原片，所以这里一定要支持。只认单段 `bytes=start-end`，多段请求按整文件返回。
 */
function sendFile(request, response, filePath) {
  const ext = path.extname(filePath)
  const size = statSync(filePath).size
  const headers = {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '')
  if (match && (match[1] || match[2])) {
    // bytes=100-  从 100 到末尾；bytes=-500  最后 500 字节
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
    let end = match[1] && match[2] ? Number(match[2]) : size - 1
    end = Math.min(end, size - 1)
    if (start > end || start >= size) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` })
      response.end()
      return
    }
    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
    })
    if (request.method === 'HEAD') return response.end()
    createReadStream(filePath, { start, end }).pipe(response)
    return
  }

  response.writeHead(200, { ...headers, 'Content-Length': size })
  if (request.method === 'HEAD') return response.end()
  createReadStream(filePath).pipe(response)
}

// 逐跳头：描述的是「这一段连接」，不能原样转发给浏览器
const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection']
// 慢请求 / 出错 / 被放弃的请求打一行日志，排查「切页要等几分钟」这类问题用
const SLOW_REQUEST_MS = 1000
const STUCK_REQUEST_MS = 5000
const inflight = new Map()
let requestSeq = 0

function logProxy(message) {
  console.log(`[proxy] ${new Date().toISOString()} ${message}`)
}

// 每 10 秒报告一次挂了超过 5 秒还没结束的请求
setInterval(() => {
  const now = Date.now()
  for (const entry of inflight.values()) {
    if (now - entry.started > STUCK_REQUEST_MS) {
      logProxy(`STUCK ${entry.method} ${entry.url} pending ${now - entry.started}ms stage=${entry.stage}`)
    }
  }
}, 10_000).unref()

async function proxyToBackend(request, response) {
  const target = `${backendUrl}${request.url}`
  const headers = new Headers()
  const id = ++requestSeq
  const entry = { method: request.method, url: request.url, started: Date.now(), stage: 'waiting-backend' }
  inflight.set(id, entry)

  // 浏览器放弃了（切页、视频只读完元数据就断开等），上游请求也要跟着取消，否则会一直占着后端连接
  const controller = new AbortController()
  response.on('close', () => {
    inflight.delete(id)
    const elapsed = Date.now() - entry.started
    if (!response.writableFinished) {
      controller.abort()
      if (elapsed > SLOW_REQUEST_MS) logProxy(`ABORTED ${entry.method} ${entry.url} after ${elapsed}ms stage=${entry.stage}`)
      return
    }
    if (elapsed > SLOW_REQUEST_MS || response.statusCode >= 500) {
      logProxy(`${response.statusCode} ${entry.method} ${entry.url} ${elapsed}ms`)
    }
  })

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    headers.set(key, Array.isArray(value) ? value.join(',') : value)
  }

  headers.delete('host')
  headers.delete('connection')

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
      duplex: 'half',
      signal: controller.signal,
    })

    entry.stage = 'streaming-body'
    const outHeaders = Object.fromEntries(upstream.headers.entries())
    for (const name of HOP_BY_HOP_HEADERS) delete outHeaders[name]
    response.writeHead(upstream.status, outHeaders)

    if (upstream.body) {
      const body = Readable.fromWeb(upstream.body)
      // 上游中途断开时必须销毁响应：否则浏览器会按 content-length 一直等剩下的字节，直到 5 分钟超时
      body.on('error', (error) => {
        if (!controller.signal.aborted) logProxy(`STREAM-ERROR ${entry.method} ${entry.url} ${error?.message ?? error}`)
        response.destroy()
      })
      body.pipe(response)
    } else {
      response.end()
    }
  } catch (error) {
    if (controller.signal.aborted) return
    logProxy(`FAILED ${entry.method} ${entry.url} ${error?.message ?? error}`)
    if (response.headersSent) {
      response.destroy()
      return
    }
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ code: 502, msg: 'Backend proxy failed' }))
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400)
    response.end()
    return
  }

  if (request.url.startsWith('/api/') || request.url === '/api' || request.url.startsWith('/uploads/')) {
    await proxyToBackend(request, response)
    return
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const decodedPath = decodeURIComponent(url.pathname)
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(distDir, safePath)

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(request, response, candidate)
    return
  }

  const indexPath = path.join(distDir, 'index.html')
  const indexHtml = await readFile(indexPath)
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  response.end(indexHtml)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`FlowMuse frontend listening on http://0.0.0.0:${port}`)
})
