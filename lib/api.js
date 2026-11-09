// 工作台数据面：/bookwriter 前缀路由。
//   GET  /                       工作台页面（lab/ 静态资源，布局对齐「投资尽调」）
//   GET  /api/catalog            书稿列表 + 当前书 + 生成历史 + 统计 + 两种风格
//   GET  /api/book?id=           单本书稿（id 省略 = 当前书）
//   GET  /api/history?kind=&q=   生成历史（建书/重建/章节/清空/切换/删除）
//   POST /api/book/current       切换当前书
//   POST /api/book/remove        删除书稿
//   POST /api/history/clear      清空历史（不动书稿）
//   兼容旧面板：/api/book、/api/styles、/api/health
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDir } from './skills.js'
import {
  KIND_LABEL, deleteBook, getBook, getBookById, getChapter, getCurrentId, listBooks, listHistory,
  renderOutline, setCurrentBook, stats, stripContent, clearHistory
} from './data.js'

const BASE = '/bookwriter'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))
const SKILL_DIRS = [fileURLToPath(new URL('../skills/', import.meta.url))]
const STYLE_LABEL = { 'liurun-bookwriter': '刘润风格', 'luozhenyu-bookwriter': '罗振宇风格' }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8'
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

function version() {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version } catch { return null }
}

// 只放行 lab/ 里的文件：拒绝 ..、点开头的路径和指到目录外的符号链接
function safeLabFile(rel) {
  if (!rel || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(LAB) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serve(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache'
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

// 只接受同源页面发来的 JSON
function readJson(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('需要 JSON'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

function styleCatalog(skillDirs) {
  const skills = skillDirs.flatMap((dir) => readDir(dir)).map((s) => ({
    name: s.name,
    label: STYLE_LABEL[s.name] || s.name,
    description: s.description,
    bodyChars: String(s.body || '').length
  }))
  return skills
}

function bookPayload(book) {
  // 列表/详情都不带正文本体：章节只给 contentChars/hasContent，正文走 /api/chapter 单独取
  const light = stripContent(book)
  return { book: light, outline: renderOutline(book) }
}

function catalog(skillDirs) {
  const books = listBooks()
  const currentId = getCurrentId()
  return {
    version: version(),
    platform: process.platform,
    books,
    currentId,
    history: listHistory({ limit: 60 }),
    stats: stats(),
    kinds: KIND_LABEL,
    styles: styleCatalog(skillDirs)
  }
}

export function registerApi(ctx, { skillDirs = SKILL_DIRS } = {}) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const url = new URL(req.url, 'http://x')
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/ping' && req.method === 'GET') return json(res, 200, { ok: true, version: version() })
        if ((path === '/api/health' || path === '/health') && req.method === 'GET') return json(res, 200, { ok: true, version: version() })

        if (path === '/api/catalog' && req.method === 'GET') {
          return json(res, 200, { ok: true, ...catalog(skillDirs) })
        }

        if (path === '/api/book' && req.method === 'GET') {
          const id = url.searchParams.get('id') || ''
          const book = id ? getBookById(id) : getBook()
          if (!book) return json(res, 404, { ok: false, error: '没有这本书稿' })
          return json(res, 200, { ok: true, ...bookPayload(book) })
        }

        // 单章正文（页面「查看」用）：优先内联存的正文，其次读 contentPath 文件
        if (path === '/api/chapter' && req.method === 'GET') {
          const bookId = url.searchParams.get('book') || ''
          const index = Number(url.searchParams.get('index') || 0)
          if (!index) return json(res, 400, { ok: false, error: 'index 必须是章节序号' })
          const data = getChapter(bookId, index)
          if (!data) return json(res, 404, { ok: false, error: '没有这一章' })
          return json(res, 200, { ok: true, ...data })
        }

        if (path === '/api/history' && req.method === 'GET') {
          const list = listHistory({
            kind: url.searchParams.get('kind') || 'all',
            q: url.searchParams.get('q') || '',
            limit: url.searchParams.get('limit') || 100
          })
          return json(res, 200, { ok: true, list, kinds: KIND_LABEL })
        }

        if (path === '/api/book/current' && req.method === 'POST') {
          const body = await readJson(req).catch((err) => err)
          if (body instanceof Error) return json(res, body.status || 400, { ok: false, error: body.message })
          const book = setCurrentBook(String(body.id || ''))
          if (!book) return json(res, 404, { ok: false, error: '没有这本书稿' })
          return json(res, 200, { ok: true, ...bookPayload(book), summary: `当前书已切到「${book.project}」` })
        }

        if (path === '/api/book/remove' && req.method === 'POST') {
          const body = await readJson(req).catch((err) => err)
          if (body instanceof Error) return json(res, body.status || 400, { ok: false, error: body.message })
          const id = String(body.id || '')
          const removed = deleteBook(id)
          return json(res, removed ? 200 : 404, { ok: removed, id, error: removed ? undefined : '没有这本书稿' })
        }

        if (path === '/api/history/clear' && req.method === 'POST') {
          const body = await readJson(req).catch((err) => err)
          if (body instanceof Error) return json(res, body.status || 400, { ok: false, error: body.message })
          clearHistory()
          return json(res, 200, { ok: true })
        }

        // ---- 兼容旧面板 ----
        if (path === '/api/styles' && req.method === 'GET') {
          const styles = styleCatalog(skillDirs).map((s) => ({ name: s.name, description: s.description }))
          return json(res, 200, { styles })
        }

        if (path.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: 'method' })
        const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '')
        const file = safeLabFile(rel)
        return file ? serve(req, res, file) : json(res, 404, { ok: false, error: 'not found' })
      } catch (err) {
        return json(res, 500, { ok: false, error: String(err?.message || '内部错误') })
      }
    },
  })
}

export { readDir }
