// 长文写作工作台 · 页面逻辑（无框架，hash 路由 + fetch /api/*）
// 布局对齐「投资尽调」：左侧 rail，右侧按路由渲染；
// 「新建书稿 / 继续写」通过 postMessage 让宿主开新对话并填好指令。
const app = document.getElementById('app')
const navBooks = document.getElementById('nav-books')
const navHistory = document.getElementById('nav-history')
const railFoot = document.getElementById('rail-foot')
const viewer = document.getElementById('viewer')
const viewerTitle = document.getElementById('viewer-title')
const viewerBody = document.getElementById('viewer-body')
const viewerCopy = document.getElementById('viewer-copy')
const toastEl = document.getElementById('toast')

// 页面挂在 /bookwriter/ 下，接口同前缀
const BASE = location.pathname.replace(/\/+$/, '') || '/bookwriter'

const state = { catalog: null, kind: 'all', q: '', current: null }

const KIND = { init: '建书', replace: '重建', status: '章节', clear: '清空', switch: '切换', delete: '删除' }
const KIND_TONE = { init: 'ok', replace: 'run', status: 'solid', clear: 'gold', switch: 'grey', delete: 'bad' }
const STATUS = {
  todo: ['grey', '○ 待写'],
  drafting: ['gold', '✎ 写作中'],
  done: ['ok', '✓ 完成']
}
const STYLE_LABEL = { 'liurun-bookwriter': '刘润风格', 'luozhenyu-bookwriter': '罗振宇风格' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const date = (iso) => (iso ? String(iso).slice(0, 10) : '')
const shortTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const kindLabel = (k) => KIND[k] || k || ''
const styleLabel = (s) => STYLE_LABEL[s] || s || '未设风格'

async function api(path, opts) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) throw new Error(body.error || `请求失败（${res.status}）`)
  return body
}

async function post(path, payload) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
}

function copy(text) {
  const value = String(text || '')
  if (!value) return
  try { navigator.clipboard?.writeText(value) } catch { /* ignore */ }
  toast('已复制到剪贴板')
}

// ---------------------------------------------------------------- 宿主通信 / 主题

addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const m = e.data
  if (m && m.type === 'bookwriter:scheme' && m.scheme) document.documentElement.dataset.scheme = m.scheme
  if (m && m.type === 'bookwriter:start-failed') toast('开新对话失败：' + (m.message || ''))
})

function start(prompt) {
  try {
    parent.postMessage({ type: 'bookwriter:start', prompt }, location.origin)
    toast('已把任务填进新对话，确认后发送即可')
  } catch {
    toast('当前环境开不了新对话，请手动复制：\n' + prompt)
  }
}

let toastTimer
function toast(text) {
  toastEl.textContent = text
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400)
}

// ---------------------------------------------------------------- viewer

let viewerCopyText = ''
function openViewer({ title, copyText = '', html = '' }) {
  viewer.hidden = false
  viewerTitle.textContent = title || ''
  viewerBody.innerHTML = html
  viewerCopy.hidden = !copyText
  viewerCopyText = copyText
}
function closeViewer() {
  viewer.hidden = true
  viewerBody.innerHTML = ''
}
document.getElementById('viewer-close').addEventListener('click', closeViewer)
viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer() })
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !viewer.hidden) closeViewer() })
viewerCopy.addEventListener('click', () => copy(viewerCopyText))

// ---------------------------------------------------------------- 路由

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]

function render() {
  const r = route()
  document.querySelectorAll('.nav a').forEach((a) => {
    const v = a.dataset.view
    const on = (v === 'home' && r === '') || (v === 'books' && (r.startsWith('books') || r.startsWith('b/'))) ||
      (v === 'history' && r.startsWith('history')) || (v === 'new' && r === 'new') || (v === 'guide' && r === 'guide')
    if (on) a.setAttribute('aria-current', 'true')
    else a.removeAttribute('aria-current')
  })
  if (r === '') return renderHome()
  if (r.startsWith('books')) return renderBooks()
  if (r.startsWith('b/')) return renderBook(decodeURIComponent(r.slice(2)))
  if (r.startsWith('history')) return renderHistory()
  if (r === 'new') return renderNew()
  if (r === 'guide') return renderGuide()
  return renderHome()
}

function wrap(html) {
  app.innerHTML = `<div class="wrap">${html}</div>`
}

function bindGo() {
  app.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go }))
}
function bindHistory() {
  app.querySelectorAll('[data-ev]').forEach((el) => el.addEventListener('click', () => openEvent(el.dataset.ev)))
}

// ---------------------------------------------------------------- 概览

function renderHome() {
  const d = state.catalog
  const s = d.stats
  const current = d.books.find((b) => b.current) || null
  const nextCh = current && current.nextIndex ? current.nextIndex : null
  wrap(`
    <header class="head">
      <span class="eyebrow">Bookwriter</span>
      <h1>长文写作工作台</h1>
      <p>两种风格的长文流水线：刘润（商业洞察 / 结构化 / 金句收尾）与罗振宇（故事开场 / 跨域联想 / 启发式输出）。
         先立章节骨架，再逐章推进；每改一章都进生成历史，重建或清空的书会转归档，随时切回来。</p>
    </header>

    <div class="stats">
      <div class="stat accent"><b>${s.books}</b><small>书稿（含归档）</small></div>
      <div class="stat"><b>${s.chapters}</b><small>章节合计</small></div>
      <div class="stat jade"><b>${s.done}<span style="font-size:13px;color:var(--ink-3)">/${s.chapters}</span></b><small>已完成章节</small></div>
      <div class="stat"><b>${s.pct}%</b><small>完成度</small></div>
      <div class="stat gold"><b>${s.events}</b><small>历史事件</small></div>
    </div>

    ${current ? `
      <div class="sec-head"><h2>正在写</h2><a class="more" href="#/b/${encodeURIComponent(current.id)}">打开 →</a></div>
      <div class="panel">
        <div class="detail-head" style="margin-bottom:8px">
          <h1 style="font-size:19px;margin:0">${esc(current.project)}</h1>
          <span class="badge">${esc(styleLabel(current.style))}</span>
          <span class="badge grey">${current.done}/${current.chapters} 章</span>
          ${nextCh ? `<span class="badge gold">下一章：第 ${nextCh} 章</span>` : '<span class="badge ok">全部完成</span>'}
        </div>
        <div class="bar"><i style="width:${pct(current.done, current.chapters)}%"></i></div>
        <div class="actions" style="margin-top:12px">
          <button class="btn" id="continue">继续写${nextCh ? `第 ${nextCh} 章` : '（收尾/通稿）'}</button>
          <button class="btn ghost" id="open-current">看章节进度</button>
        </div>
      </div>` : `
      <div class="sec-head"><h2>还没有当前书稿</h2></div>
      <div class="empty-box"><b>先在对话里立一本书</b>
        在「新建书稿」填书名、风格和章节清单，会打开新对话并带上「init 骨架 → 逐章写 → 记录进度」的指令。</div>`}

    <div class="sec-head"><h2>最近动作</h2><a class="more" href="#/history">全部 →</a>
      <span class="sub">建书 / 章节 / 清空 / 切换 / 删除</span></div>
    ${d.history.length ? `<div class="panel">${d.history.slice(0, 6).map(eventRow).join('')}</div>`
      : `<div class="empty-box"><b>还没有历史记录</b>init 一本书就会留档。</div>`}

    <div class="sec-head"><h2>下一步</h2></div>
    <div class="grid">
      <div class="card" data-go="#/new">
        <div class="card-top"><span class="dot" style="background:var(--accent)"></span><span class="card-title">新建一本书</span></div>
        <div class="card-sub">填书名、风格、章节清单 → 打开新对话并带上完整写作指令</div>
      </div>
      <div class="card" data-go="#/books">
        <div class="card-top"><span class="dot" style="background:var(--jade)"></span><span class="card-title">我的书稿</span></div>
        <div class="card-sub">看每本的章节进度，切回之前重建/清空掉的书</div>
      </div>
      <div class="card" data-go="#/history">
        <div class="card-top"><span class="dot" style="background:var(--gold)"></span><span class="card-title">生成历史</span></div>
        <div class="card-sub">谁在什么时候改了哪一章，一眼看到</div>
      </div>
      <div class="card" data-go="#/guide">
        <div class="card-top"><span class="dot" style="background:var(--ink-3)"></span><span class="card-title">两种风格</span></div>
        <div class="card-sub">心法、结构、质量检查与常见翻车点</div>
      </div>
    </div>
  `)
  bindGo()
  bindHistory()
  const cont = app.querySelector('#continue')
  if (cont) cont.addEventListener('click', () => start(
    `继续写《${current.project}》（bookwriter 当前书，风格 ${styleLabel(current.style)}）。` +
    `先用 bookwriter_project action=list 看进度，把第 ${nextCh || current.chapters} 章写成正文（遵循对应风格 skill 的方法论、结构与质量检查），` +
    `写完用 action=status index=${nextCh || current.chapters} status=done summary="一句话摘要" 记录；再按同样方式推进后面的章节。`))
  const open = app.querySelector('#open-current')
  if (open) open.addEventListener('click', () => { location.hash = '#/b/' + encodeURIComponent(current.id) })
}

function bookCard(b) {
  return `<div class="card" data-go="#/b/${encodeURIComponent(b.id)}">
    <div class="card-top">
      <span class="dot" style="background:${b.current ? 'var(--accent)' : b.archivedAt ? 'var(--grey)' : 'var(--jade)'}"></span>
      <span class="card-title">${esc(b.project)}</span>
      ${b.current ? '<span class="badge solid">当前</span>' : b.archivedAt ? '<span class="badge grey">归档</span>' : ''}
    </div>
    <div class="card-sub muted">${esc(styleLabel(b.style))} · ${b.chapters} 章 · ${b.done} 完成${b.drafting ? ` · ${b.drafting} 写作中` : ''}</div>
    <div class="card-foot">
      <div class="bar" style="flex:1"><i style="width:${pct(b.done, b.chapters)}%"></i></div>
      <span>${pct(b.done, b.chapters)}%</span>
      <span>${date(b.updatedAt)}</span>
    </div>
  </div>`
}

function eventRow(e) {
  return `<div class="hrow" data-ev="${esc(e.id)}">
    <span class="when">${esc(shortTime(e.at))}</span>
    <span class="badge ${KIND_TONE[e.kind] || 'grey'}">${esc(kindLabel(e.kind))}</span>
    <span class="what">
      <b>${esc(e.project || e.bookId)}</b>
      <div>${esc(e.summary || '')}</div>
    </span>
  </div>`
}

// ---------------------------------------------------------------- 我的书稿

function renderBooks() {
  const d = state.catalog
  const needle = state.q.trim().toLowerCase()
  const books = d.books.filter((b) => !needle || `${b.project} ${b.style}`.toLowerCase().includes(needle))
  wrap(`
    <header class="head">
      <h1>我的书稿</h1>
      <p>共 ${d.books.length} 本，${d.stats.chapters} 章。当前书是模型 bookwriter_project 正在写的那一本；归档的是被重建或清空过的，随时可以切回来。</p>
    </header>
    <div class="toolbar">
      <input class="search" id="q" placeholder="搜书名 / 风格" value="${esc(state.q)}">
      <span class="badge grey">完成度 ${d.stats.pct}%</span>
    </div>
    ${books.length ? `<div class="grid">${books.map(bookCard).join('')}</div>`
      : `<div class="empty-box"><b>${needle ? '没有匹配的书稿' : '还没有书稿'}</b>
          ${needle ? '换个关键词试试。' : '去「新建书稿」发起一本，或在对话里让模型 bookwriter_project action=init 建一本。'}</div>`}
  `)
  const q = document.getElementById('q')
  q.addEventListener('input', (e) => {
    state.q = e.target.value
    renderBooks()
    setTimeout(() => { const n = document.getElementById('q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length) } }, 0)
  })
  bindGo()
}

// ---------------------------------------------------------------- 书稿详情

async function renderBook(id) {
  app.innerHTML = '<div class="loading">读取书稿…</div>'
  let data
  try {
    data = await api(`/api/book?id=${encodeURIComponent(id)}`)
  } catch (err) {
    wrap(`<div class="empty-box"><b>读不到这本书</b>${esc(err.message)}</div>`)
    return
  }
  state.current = data
  const b = data.book
  const chapters = b.chapters || []
  const done = chapters.filter((c) => c.status === 'done').length
  const current = (state.catalog.books || []).find((x) => x.id === b.id)
  const isCurrent = Boolean(current && current.current)
  const recs = (state.catalog.history || []).filter((e) => e.bookId === b.id).slice(0, 12)
  wrap(`
    <header class="head">
      <a class="card-sub" href="#/books">← 我的书稿</a>
      <div class="detail-head" style="margin-top:6px">
        <h1>${esc(b.project || '（未命名）')}</h1>
        <span class="badge">${esc(styleLabel(b.style))}</span>
        <span class="badge grey">${chapters.length} 章 · ${done} 完成</span>
        ${isCurrent ? '<span class="badge solid">当前书</span>' : b.archivedAt ? '<span class="badge grey">归档</span>' : ''}
      </div>
      <p style="margin-top:6px">建 ${esc(shortTime(b.createdAt))} · 改 ${esc(shortTime(b.updatedAt))} · ${esc(pct(done, chapters.length))}%</p>
    </header>

    <div class="actions" style="margin-bottom:14px">
      ${isCurrent ? '' : '<button class="btn" id="set-current">设为当前书</button>'}
      <button class="btn ghost" id="continue">在对话里继续写</button>
      <button class="btn ghost" id="copy-outline">复制章节清单</button>
      <button class="btn danger" id="remove">删除</button>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bar"><i style="width:${pct(done, chapters.length)}%"></i></div>
      <div class="card-foot" style="margin-top:8px">
        <span>待写 ${chapters.filter((c) => c.status === 'todo').length}</span>
        <span>写作中 ${chapters.filter((c) => c.status === 'drafting').length}</span>
        <span>完成 ${done}</span>
      </div>
    </div>

    <div class="sec-head"><h2>章节</h2><span class="sub">状态由模型用 bookwriter_project action=status 更新</span></div>
    ${chapters.length ? `<div class="panel" style="padding:6px 0">
      <table class="chapters">
        <thead><tr><th style="width:44px">#</th><th>标题</th><th style="width:84px">状态</th><th>摘要</th><th style="width:92px">更新</th></tr></thead>
        <tbody>${chapters.map((c) => {
          const [tone, label] = STATUS[c.status] || STATUS.todo
          return `<tr>
            <td class="num">${c.index}</td>
            <td><b>${esc(c.title)}</b></td>
            <td class="state"><span class="badge ${tone}">${label}</span></td>
            <td class="summary">${esc(c.summary || '—')}</td>
            <td class="when">${esc(shortTime(c.updatedAt))}</td>
          </tr>`
        }).join('')}</tbody>
      </table>
    </div>` : '<div class="empty-box"><b>这本书还没有章节</b>在对话里用 bookwriter_project action=init 建章节骨架。</div>'}

    <div class="sec-head"><h2>这本书的历史</h2><a class="more" href="#/history">全部 →</a></div>
    ${recs.length ? `<div class="panel">${recs.map(eventRow).join('')}</div>`
      : '<div class="empty-box"><b>还没有记录</b>建书或改章节后会在这里出现。</div>'}
  `)

  bindHistory()
  const setCurrent = app.querySelector('#set-current')
  if (setCurrent) setCurrent.addEventListener('click', async () => {
    try {
      await post('/api/book/current', { id: b.id })
      await boot()
      toast('已设为当前书，接着写就会写这本')
      renderBook(b.id)
    } catch (err) { toast('切换失败：' + err.message) }
  })
  const continueBtn = app.querySelector('#continue')
  if (continueBtn) continueBtn.addEventListener('click', () => start(
    `继续写《${b.project}》（书稿 id=${b.id}，风格 ${styleLabel(b.style)}）。` +
    `先 bookwriter_project action=list 看当前进度${isCurrent ? '' : '；如果当前书不是这本，先 action=current id=' + b.id}；` +
    `然后按对应风格 skill 的方法论与结构把未完成的章节写成正文，每完成一章用 action=status 记一笔（status=done + 一句话摘要）。`))
  const copyOutline = app.querySelector('#copy-outline')
  if (copyOutline) copyOutline.addEventListener('click', () => copy(data.outline || ''))
  const removeBtn = app.querySelector('#remove')
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    if (!confirm(`删除书稿「${b.project}」？进度记录会一起删（生成历史里留一条删除记录）。`)) return
    try {
      await post('/api/book/remove', { id: b.id })
      await boot()
      location.hash = '#/books'
      toast('已删除')
    } catch (err) { toast('删除失败：' + err.message) }
  })
}

// ---------------------------------------------------------------- 生成历史

function renderHistory() {
  const d = state.catalog
  const needle = state.q.trim().toLowerCase()
  const list = (d.history || []).filter((e) => {
    const hitKind = state.kind === 'all' || e.kind === state.kind
    const hitQ = !needle || `${e.project} ${e.summary} ${e.chapterTitle || ''}`.toLowerCase().includes(needle)
    return hitKind && hitQ
  })
  wrap(`
    <header class="head">
      <h1>生成历史</h1>
      <p>建书、章节进度、清空、切换、删除都留一条：${d.stats.events} 条记录。点任意一行看当次详情。</p>
    </header>
    <div class="toolbar">
      ${['all', 'init', 'replace', 'status', 'clear', 'switch', 'delete'].map((k) => `
        <button class="pill" data-kind="${k}" aria-pressed="${state.kind === k}">${k === 'all' ? '全部' : KIND[k]}</button>`).join('')}
      <input class="search" id="h-q" placeholder="搜书名 / 章节 / 摘要" value="${esc(state.q)}">
    </div>
    ${list.length ? `<div class="panel">${list.map(eventRow).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的记录</b>换个筛选条件，或先去建一本书。</div>`}
    <div class="toolbar" style="margin-top:16px">
      <button class="btn ghost small" id="clear">清空历史</button>
      <span class="card-sub muted" style="font-size:11px">只删记录，不动书稿本身。</span>
    </div>
  `)
  app.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { state.kind = b.dataset.kind; renderHistory() }))
  const q = document.getElementById('h-q')
  q.addEventListener('input', (e) => {
    state.q = e.target.value
    if (q._t) clearTimeout(q._t)
    q._t = setTimeout(() => renderHistory(), 240)
  })
  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm('清空全部生成历史？（书稿不会删）')) return
    try {
      await post('/api/history/clear', {})
      await boot()
      toast('历史已清空')
    } catch (err) { toast('清空失败：' + err.message) }
  })
  bindHistory()
}

function openEvent(id) {
  const e = (state.catalog.history || []).find((x) => x.id === id)
  if (!e) { toast('找不到这条记录'); return }
  const book = (state.catalog.books || []).find((b) => b.id === e.bookId)
  openViewer({
    title: `${kindLabel(e.kind)} · ${e.project || e.bookId}`,
    copyText: e.summary || '',
    html: `
      <div class="detail-head" style="margin-bottom:8px">
        <h1 style="font-size:19px;margin:0">${esc(e.project || e.bookId)}</h1>
        <span class="badge ${KIND_TONE[e.kind] || 'grey'}">${esc(kindLabel(e.kind))}</span>
        ${e.chapterIndex ? `<span class="badge grey">第 ${e.chapterIndex} 章</span>` : ''}
        ${e.status ? `<span class="badge grey">${esc(e.status)}</span>` : ''}
        ${book ? `<span class="badge grey">${book.done}/${book.chapters} 章</span>` : ''}
      </div>
      <div class="card-sub muted" style="margin-bottom:10px">${esc(shortTime(e.at))} · ${esc(e.summary || '')} · event ${esc(e.id)}</div>
      ${e.chapterTitle ? `<div class="kv"><dt>章节</dt><dd>${esc(e.chapterTitle)}</dd></div>` : ''}
      ${book ? `<div class="actions" style="margin-top:12px">
        <button class="btn ghost small" id="open-book">打开这本书</button>
        ${book.current ? '' : '<button class="btn small" id="set-current">设为当前书</button>'}
      </div>` : ''}
    `
  })
  const openBook = document.getElementById('open-book')
  if (openBook) openBook.addEventListener('click', () => { closeViewer(); location.hash = '#/b/' + encodeURIComponent(e.bookId) })
  const setCurrent = document.getElementById('set-current')
  if (setCurrent) setCurrent.addEventListener('click', async () => {
    try {
      await post('/api/book/current', { id: e.bookId })
      closeViewer()
      await boot()
      toast('已设为当前书')
    } catch (err) { toast('切换失败：' + err.message) }
  })
}

// ---------------------------------------------------------------- 新建书稿

function renderNew() {
  const d = state.catalog
  const styles = d.styles && d.styles.length ? d.styles : [
    { name: 'liurun-bookwriter', label: '刘润风格' },
    { name: 'luozhenyu-bookwriter', label: '罗振宇风格' }
  ]
  wrap(`
    <header class="head">
      <span class="eyebrow">骨架 → 逐章 → 成稿</span>
      <h1>新建书稿</h1>
      <p>填好之后会打开一个新对话，指令已经写全：先 init 章节骨架，再按所选风格逐章写正文，每章完成用 status 记一笔。</p>
    </header>

    <div class="panel">
      <div class="form">
        <label class="fld">书名 / 主题
          <input id="f-project" placeholder="如 定价的常识">
        </label>
        <label class="fld">风格
          <select id="f-style">
            ${styles.map((s) => `<option value="${esc(s.name)}">${esc(s.label || s.name)}</option>`).join('')}
          </select>
        </label>
        <label class="fld">每章字数（约）
          <select id="f-words">
            <option value="1500">1500 字 / 章</option>
            <option value="2500" selected>2500 字 / 章</option>
            <option value="4000">4000 字 / 章</option>
          </select>
        </label>
        <label class="fld full">章节标题（竖线或换行分隔；留空让模型先给大纲）
          <textarea id="f-chapters" rows="4" placeholder="第一章 引子｜第二章 锚定｜第三章 捆绑｜第四章 免费"></textarea>
        </label>
        <label class="fld full">这本书要回答什么（可选）
          <input id="f-question" placeholder="如：为什么同样的东西定不同价，用户反而更愿意买">
        </label>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" id="f-go">建章节骨架 + 开写 →</button>
        <button class="btn ghost" id="f-outline">先只要大纲</button>
      </div>
      <div class="note" style="margin-top:12px">
        重建一本同名书时旧书不会丢：会转成归档留在「我的书稿」里，随时切回来。
        章节清单里用 <code>｜</code> 或换行分隔；每章摘要会显示在书稿详情里。
      </div>
    </div>

    ${d.books.length ? `
      <div class="sec-head"><h2>或者接着上次</h2></div>
      <div class="grid">${d.books.slice(0, 3).map(bookCard).join('')}</div>` : ''}
  `)
  bindGo()
  const readForm = () => ({
    project: document.getElementById('f-project').value.trim(),
    style: document.getElementById('f-style').value,
    styleLabel: (document.querySelector('#f-style option:checked') || {}).textContent || document.getElementById('f-style').value,
    words: document.getElementById('f-words').value,
    chapters: document.getElementById('f-chapters').value.split(/[｜|\n]/).map((t) => t.trim()).filter(Boolean),
    question: document.getElementById('f-question').value.trim()
  })
  document.getElementById('f-go').addEventListener('click', () => {
    const f = readForm()
    if (!f.project) return toast('先填个书名')
    const titles = f.chapters.length ? f.chapters : []
    start(`用 ${f.styleLabel} 写一本《${f.project}》${titles.length ? `，共 ${titles.length} 章` : `（章节先按主题规划）`}。
${f.question ? `这本书要回答：${f.question}\n` : ''}每章约 ${f.words} 字。

请用 bookwriter 插件推进：
1. 先 bookwriter_project action=init：project="${f.project}"、style=${f.style}、chapters=${titles.length ? titles.join('|') : '（你先给 6–8 章的标题清单）'}。
2. 加载 ${f.style} 技能，按它的方法论/结构/质量检查逐章写正文；每章写完用 action=status index=N status=done summary="这一章讲了什么" 记一笔。
3. 每章交付时给我：本章一句话主旨 + 结构（SCQA/三段式等）+ 正文，并说明用了哪几个心法。
4. 全部写完后用 action=list 汇总进度，告诉我哪章还可以再打磨。
侧栏「长文写作」工作台里能看到章节进度和每次改动记录。`)
  })
  document.getElementById('f-outline').addEventListener('click', () => {
    const f = readForm()
    if (!f.project) return toast('先填个书名')
    start(`用 ${f.styleLabel} 给《${f.project}》做一份章节大纲（先不要写正文）：${f.question ? `主题是「${f.question}」。` : ''}
输出 6–8 章，每章给：标题、一句话主旨、结构类型（SCQA/三段式/10点式等）、预计字数。
确认后我会让你用 bookwriter_project action=init 把骨架存下来，再逐章写。`)
  })
}

// ---------------------------------------------------------------- 两种风格

function renderGuide() {
  const d = state.catalog
  const styles = d.styles && d.styles.length ? d.styles : []
  wrap(`
    <header class="head">
      <span class="eyebrow">Two styles</span>
      <h1>两种风格，一套流程</h1>
      <p>两个 skill 各自复刻了完整的写作操作系统：学的是风格与结构，不抄原句。选风格决定「怎么讲」，流程保证「写得完」。</p>
    </header>

    <div class="grid">
      <div class="card plain">
        <div class="card-top"><span class="card-title">刘润风格 · 商业洞察</span></div>
        <div class="card-sub">28 年商业写作心法：同理心 / 对象感 / 逻辑势能（SCQA）/ 5 商派 SCA++ / 3 种结构（3 段式、10 点式、32 条）/ 单反聚焦 / 用词游标卡尺。</div>
        <div class="card-foot"><span>擅长：商业评论、方法论、案例拆解、企业家专访</span></div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title">罗振宇风格 · 启发式</span></div>
        <div class="card-sub">14 年内容心法：躬身入局 / 长期主义 / 启发式输出 / 一具体就深刻 / 故事细节 / 金句主义 / 打比方 / 动词驱动 / 谦卑自嘲；结构有 60 秒、长文、跨年演讲。</div>
        <div class="card-foot"><span>擅长：认知升级、趋势分析、个人成长、演讲稿</span></div>
      </div>
    </div>

    <div class="sec-head"><h2>三步流程</h2></div>
    <div class="grid">
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--accent-ink)">01 · 立骨架</span></div>
        <div class="card-sub">bookwriter_project action=init：书名 + 风格 + 章节标题清单。清单就是后续的进度条，别写到哪算哪。</div>
        <div class="pre" style="margin-top:8px">action=init project=书名 style=liurun-bookwriter chapters=一|二|三</div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--jade)">02 · 逐章写</span></div>
        <div class="card-sub">按风格 skill 的结构与质量检查写正文：每章先一句话主旨，再落结构（SCQA 等），最后金句收尾；写完立刻记一笔。</div>
        <div class="pre" style="margin-top:8px">action=status index=2 status=done summary="锚定效应怎么用"</div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--gold)">03 · 收与改</span></div>
        <div class="card-sub">全部写完用 list 看进度；要改哪章就把 status 改回 drafting 再重写。重建/清空不会丢书——旧书转归档，能切回。</div>
        <div class="pre" style="margin-top:8px">action=list / action=books / action=current id=bk-xxx</div>
      </div>
    </div>

    <div class="sec-head"><h2>常见问题</h2></div>
    <div class="panel">
      <dl class="kv">
        <dt>要 API key 吗</dt><dd>不要。两个 skill 是纯方法论提示词，写作由当前对话模型完成。</dd>
        <dt>能换风格吗</dt><dd>能。换风格等于换一本新书（init 时选另一个 style）；同名重建会覆盖，一定要 confirm:"yes"。</dd>
        <dt>写一半断了</dt><dd>章节进度存在本地，下次说「继续写《书名》」，模型 list 一下就知道写到哪。</dd>
        <dt>进度存哪</dt><dd>$DSH_HOME/bookwriter/：books.json（书稿 + 章节 + 归档）、history.json（建书/章节/清空/切换/删除事件）。</dd>
        <dt>一本书能多人看吗</dt><dd>工作台是本地页面，当前书就是模型在写的那本；切换当前书会影响模型接下来写哪本，切之前先确认。</dd>
      </dl>
    </div>

    ${styles.length ? `
      <div class="sec-head"><h2>随包技能</h2></div>
      <div class="panel">
        ${styles.map((s) => `<div style="margin-bottom:10px"><b>${esc(s.label || s.name)}</b> <span class="card-sub muted">${esc(s.name)}</span>
          <div class="card-sub muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(s.description)}</div></div>`).join('')}
      </div>` : ''}
  `)
}

// ---------------------------------------------------------------- 启动

async function boot() {
  try {
    state.catalog = await api('/api/catalog')
    const s = state.catalog.stats
    navBooks.textContent = s.books || ''
    navHistory.textContent = s.events || ''
    railFoot.innerHTML = `
      <span class="txt">${s.books} 本书 · ${s.chapters} 章（完成 ${s.done}）</span>
      <span class="txt">${s.pct}% 完成度 · ${s.events} 条历史</span>
      <span class="txt">${s.current ? '当前：' + esc(s.current.project) : '还没有当前书'}</span>
      <span class="txt">v${esc(state.catalog.version || '')}</span>`
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty-box"><b>读不到工作台数据</b>${esc(err.message)}<br>
      插件可能刚装好，刷新页面再试；如果一直这样，看看 DSH 的插件日志。</div></div>`
    return
  }
  render()
}

addEventListener('hashchange', render)
boot()
