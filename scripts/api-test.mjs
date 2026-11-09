// 接口验收：起一个本地 http 挂 registerApi 的 handler，用真实 fetch 打一遍工作台接口。
// 不碰真实数据目录（DSH_HOME 指到 .tmp/），不联网。
import { createServer } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), '.tmp', 'api-test')
rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })
process.env.DSH_HOME = join(ROOT, 'home')

const data = await import('../lib/data.js')
const { registerApi } = await import('../lib/api.js')

let handler = null
registerApi({ get: () => undefined, webServer: { register(cfg) { handler = cfg.handler; return () => {} } } }, { skillDirs: [join(process.cwd(), 'skills')] })
if (!handler) throw new Error('registerApi 没注册 handler')

const server = createServer((req, res) => handler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const P = '/bookwriter'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }
const get = async (path) => {
  const res = await fetch(base + path)
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() }
}
const postJson = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  return { status: res.status, json: JSON.parse((await res.text()) || '{}') }
}

try {
  // ── 造数据：两本书（第二本覆盖第一本，触发归档）
  const first = data.initBook('定价的常识', 'liurun-bookwriter', ['引子', '锚定', '捆绑'])
  data.updateChapter(1, { status: 'done', summary: '讲完为什么定价是心理战' })
  const second = data.initBook('认知升级', 'luozhenyu-bookwriter', ['躬身入局', '长期主义'], true)

  const ping = await get(`${P}/api/ping`)
  check('ping', ping.status === 200 && String(JSON.parse(ping.text).version).startsWith('0.3.'), ping.text)

  const cat = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('catalog: 两本书', cat.ok && cat.books.length === 2, `books=${cat.books.length}`)
  check('catalog: 当前书是第二本', cat.currentId === second.id && cat.books.some((b) => b.current && b.id === second.id))
  check('catalog: 第一本已归档', cat.books.some((b) => b.id === first.id && b.archivedAt), cat.books.map((b) => `${b.project}${b.archivedAt ? '(归档)' : ''}`).join(' / '))
  check('catalog: 统计', cat.stats.books === 2 && cat.stats.chapters === 5 && cat.stats.done === 1 && cat.stats.events === 3, JSON.stringify(cat.stats).slice(0, 140))
  check('catalog: 两种风格', cat.styles.length === 2 && cat.styles.every((s) => s.label), cat.styles.map((s) => s.label).join('/'))

  const detail = JSON.parse((await get(`${P}/api/book?id=${encodeURIComponent(first.id)}`)).text)
  check('book: 归档书详情 + 章节清单', detail.ok && detail.book.chapters.length === 3 && detail.outline.includes('[done]'), detail.outline.split('\n')[0])
  const currentBook = JSON.parse((await get(`${P}/api/book`)).text)
  check('book: 不带 id 返回当前书', currentBook.book.id === second.id, currentBook.book.project)
  const missing = await get(`${P}/api/book?id=nope`)
  check('book: 不存在 404', missing.status === 404)

  const hi = JSON.parse((await get(`${P}/api/history?kind=status`)).text)
  check('history: 按类型过滤', hi.list.length === 1 && hi.list[0].chapterIndex === 1, hi.list[0]?.summary)

  // ── 切回第一本 + 删掉第二本
  const switched = await postJson(`${P}/api/book/current`, { id: first.id })
  check('book/current 切换', switched.status === 200 && switched.json.book.id === first.id, switched.json.summary)
  const afterSwitch = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('切换后当前书是归档那本', afterSwitch.currentId === first.id && afterSwitch.books.find((b) => b.id === first.id).current)

  // ── 章节正文：内联 content + contentPath 文件两种来源
  data.updateChapter(1, { content: '# 引子\n\n定价从来不是算成本，而是猜人心。\n\n- 锚定\n- 捆绑' })
  const ch = JSON.parse((await get(`${P}/api/chapter?book=${encodeURIComponent(first.id)}&index=1`)).text)
  check('chapter: 内联正文可取', ch.ok && ch.body.includes('猜人心') && ch.source === 'inline', `${ch.body?.length} 字`)
  const chEmpty = JSON.parse((await get(`${P}/api/chapter?book=${encodeURIComponent(first.id)}&index=2`)).text)
  check('chapter: 没正文时 body 为空', chEmpty.ok && chEmpty.body === '' && chEmpty.source === 'none')

  const { writeFileSync } = await import('node:fs')
  const chapterFile = join(ROOT, 'ch3.md')
  writeFileSync(chapterFile, '# 捆绑\n\n第三章的正文写在文件里。', 'utf8')
  data.updateChapter(3, { contentPath: chapterFile })
  const chFile = JSON.parse((await get(`${P}/api/chapter?book=${encodeURIComponent(first.id)}&index=3`)).text)
  check('chapter: contentPath 文件可读', chFile.ok && chFile.source === 'file' && chFile.body.includes('正文写在文件里'), chFile.source)

  const bookPayload = JSON.parse((await get(`${P}/api/book?id=${encodeURIComponent(first.id)}`)).text)
  const c1 = bookPayload.book.chapters[0]
  check('book: 章节不带正文本体但要标记', !('content' in c1) && c1.hasContent === true && c1.contentChars > 0, `chars=${c1.contentChars}`)
  check('book: 文件正文也标记有内容', bookPayload.book.chapters[2].hasContent === true)

  const removed = await postJson(`${P}/api/book/remove`, { id: second.id })
  check('book/remove', removed.status === 200 && removed.json.ok === true)
  const afterRemove = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('删除后只剩一本', afterRemove.books.length === 1 && afterRemove.books[0].id === first.id)

  // ── 静态页面
  const page = await get(`${P}/`)
  check('静态页面 index.html', page.status === 200 && page.text.includes('长文写作'), `${page.status} ${page.type}`)
  const css = await get(`${P}/app.css`)
  check('静态页面 app.css', css.status === 200 && css.type.includes('css'))
  const js = await get(`${P}/app.js`)
  check('静态页面 app.js', js.status === 200 && js.text.includes('renderHistory'))
  const traversal = await get(`${P}/..%2f..%2fpackage.json`)
  check('静态页面越界被拒', traversal.status === 404, String(traversal.status))

  // ── 兼容旧面板 + 清空历史
  const styles = JSON.parse((await get(`${P}/api/styles`)).text)
  check('兼容 /api/styles', styles.styles.length === 2)
  const health = JSON.parse((await get(`${P}/api/health`)).text)
  check('兼容 /api/health', health.ok === true)
  const cleared = await postJson(`${P}/api/history/clear`, {})
  const afterClear = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('history/clear', cleared.json.ok === true && afterClear.history.length === 0 && afterClear.books.length === 1)
} finally {
  server.close()
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)

