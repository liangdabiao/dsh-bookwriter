// 双风格长文写作 · 书稿与进度持久化（$DSH_HOME/bookwriter/）。
//
//   books.json   { currentId, books: [{ id, project, style, chapters[], createdAt, updatedAt, archivedAt }] }
//                chapters: [{ index, title, status, summary, updatedAt }]，status: todo | drafting | done
//   history.json [{ id, at, kind: init|replace|status|clear|switch|delete, bookId, project, chapterIndex?,
//                   chapterTitle?, status?, summary }]
//
// 「当前书」是模型 bookwriter_project 工具读写的那一本；重建/清空/删掉的书会转成归档留在册子里，
// 工作台「我的书稿」里能切回来，每次变化都进「生成历史」。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'bookwriter')
const BOOKS_FILE = join(DATA_DIR, 'books.json')
const LEGACY_FILE = join(DATA_DIR, 'book.json')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
export const STYLE_NAMES = ['liurun-bookwriter', 'luozhenyu-bookwriter']
export const STATUSES = ['todo', 'drafting', 'done']
export const KIND_LABEL = { init: '建书', replace: '重建', status: '章节', clear: '清空', switch: '切换', delete: '删除' }
const MAX_BOOKS = 60
const MAX_HISTORY = 300

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readJson(file, fallback) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return raw ?? fallback
  } catch {
    return fallback
  }
}

// 原子写：先 .tmp 再 rename，页面轮询时不会读到半截 JSON。
function writeJson(file, value) {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (err) {
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    throw err
  }
}

const nowIso = () => new Date().toISOString()
const newId = () => `bk-${Date.now().toString(36)}`

function normalizeBook(raw) {
  const chapters = Array.isArray(raw?.chapters) ? raw.chapters : []
  return {
    id: raw?.id || newId(),
    project: String(raw?.project || ''),
    style: STYLE_NAMES.includes(raw?.style) ? raw.style : String(raw?.style || ''),
    chapters: chapters.map((c, i) => ({
      index: Number(c?.index) || i + 1,
      title: String(c?.title || `第${i + 1}章`),
      status: STATUSES.includes(c?.status) ? c.status : 'todo',
      summary: String(c?.summary || ''),
      updatedAt: c?.updatedAt || null
    })).sort((a, b) => a.index - b.index),
    createdAt: raw?.createdAt || raw?.updatedAt || null,
    updatedAt: raw?.updatedAt || raw?.createdAt || null,
    archivedAt: raw?.archivedAt || null
  }
}

function loadStore() {
  const store = readJson(BOOKS_FILE, null)
  if (store && Array.isArray(store.books)) {
    return { currentId: store.currentId || '', books: store.books.map(normalizeBook) }
  }
  // 旧版只有一个 book.json：迁移成第一本当前书，别让老数据消失。
  const legacy = readJson(LEGACY_FILE, null)
  if (legacy && Array.isArray(legacy.chapters) && legacy.chapters.length) {
    const book = normalizeBook(legacy)
    const migrated = { currentId: book.id, books: [book] }
    writeJson(BOOKS_FILE, migrated)
    try { rmSync(LEGACY_FILE, { force: true }) } catch { /* ignore */ }
    return migrated
  }
  return { currentId: '', books: [] }
}

function saveStore(store) {
  if (store.books.length > MAX_BOOKS) {
    // 超量时先丢最老的归档书，当前书永远保留
    const keep = store.books
      .filter((b) => b.id === store.currentId)
      .concat(store.books.filter((b) => b.id !== store.currentId && b.archivedAt).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt))))
      .slice(0, MAX_BOOKS)
    store.books = keep
  }
  writeJson(BOOKS_FILE, store)
}

// ---------------------------------------------------------------- 书

export function getBook() {
  const store = loadStore()
  const current = store.books.find((b) => b.id === store.currentId)
  return current || { id: '', project: '', style: '', chapters: [], createdAt: null, updatedAt: null, archivedAt: null }
}

export function getBookById(id) {
  return loadStore().books.find((b) => b.id === id) || null
}

export function listBooks() {
  const store = loadStore()
  return store.books
    .map((b) => ({
      id: b.id,
      project: b.project || '（未命名）',
      style: b.style,
      chapters: b.chapters.length,
      done: b.chapters.filter((c) => c.status === 'done').length,
      drafting: b.chapters.filter((c) => c.status === 'drafting').length,
      nextIndex: (b.chapters.find((c) => c.status !== 'done') || {}).index || null,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      archivedAt: b.archivedAt,
      current: b.id === store.currentId
    }))
    .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export function getCurrentId() {
  return loadStore().currentId
}

// init：建立新书（覆盖重来需 confirm；原来那本转归档，不进垃圾桶）。
export function initBook(project, style, chapterTitles, confirm = false) {
  const store = loadStore()
  const current = store.books.find((b) => b.id === store.currentId)
  if (current && current.chapters.length && !confirm) {
    return { conflict: true, project: current.project, chapters: current.chapters.length }
  }
  const at = nowIso()
  if (current && current.chapters.length) {
    current.archivedAt = at
    current.updatedAt = at
  }
  const book = normalizeBook({
    id: newId(),
    project,
    style,
    chapters: chapterTitles.map((title, i) => ({ index: i + 1, title, status: 'todo', summary: '', updatedAt: at })),
    createdAt: at,
    updatedAt: at
  })
  store.books = [book, ...store.books]
  store.currentId = book.id
  saveStore(store)
  appendHistory({
    kind: current && current.chapters.length ? 'replace' : 'init',
    bookId: book.id,
    project: book.project,
    summary: `${current && current.chapters.length ? '重建' : '建书'}「${book.project}」：${book.chapters.length} 章 · ${style}`
  })
  return book
}

// 更新章节状态/摘要（不存在的章自动追加）。
export function updateChapter(index, patch) {
  const store = loadStore()
  const book = store.books.find((b) => b.id === store.currentId)
  if (!book) return null
  let chapter = book.chapters.find((c) => c.index === index)
  if (!chapter) {
    chapter = { index, title: patch.title || `第${index}章`, status: 'todo', summary: '', updatedAt: '' }
    book.chapters.push(chapter)
    book.chapters.sort((a, b) => a.index - b.index)
  }
  const before = { status: chapter.status, title: chapter.title }
  if (patch.title !== undefined) chapter.title = patch.title
  if (patch.status !== undefined && STATUSES.includes(patch.status)) chapter.status = patch.status
  if (patch.summary !== undefined) chapter.summary = String(patch.summary).slice(0, 500)
  chapter.updatedAt = nowIso()
  book.updatedAt = chapter.updatedAt
  saveStore(store)
  appendHistory({
    kind: 'status',
    bookId: book.id,
    project: book.project,
    chapterIndex: chapter.index,
    chapterTitle: chapter.title,
    status: chapter.status,
    summary: `第 ${chapter.index} 章「${chapter.title}」：${before.status} → ${chapter.status}${chapter.summary ? `（${chapter.summary}）` : ''}`
  })
  return chapter
}

// 清空：当前书转归档（可切回），不是删除。
export function clearBook() {
  const store = loadStore()
  const book = store.books.find((b) => b.id === store.currentId)
  if (book) {
    book.archivedAt = nowIso()
    book.updatedAt = book.archivedAt
    appendHistory({ kind: 'clear', bookId: book.id, project: book.project, summary: `清空当前书稿「${book.project}」（已转归档，可切回）` })
  }
  store.currentId = ''
  saveStore(store)
}

export function setCurrentBook(id) {
  const store = loadStore()
  const book = store.books.find((b) => b.id === id)
  if (!book) return null
  store.currentId = book.id
  book.archivedAt = null
  saveStore(store)
  appendHistory({ kind: 'switch', bookId: book.id, project: book.project, summary: `切换到书稿「${book.project}」` })
  return book
}

export function deleteBook(id) {
  const store = loadStore()
  const book = store.books.find((b) => b.id === id)
  if (!book) return false
  store.books = store.books.filter((b) => b.id !== id)
  if (store.currentId === id) store.currentId = ''
  saveStore(store)
  appendHistory({ kind: 'delete', bookId: book.id, project: book.project, summary: `删除书稿「${book.project}」（${book.chapters.length} 章）` })
  return true
}

// 章节清单文本（工具 list / 页面详情共用）
export function renderOutline(book) {
  return book.chapters
    .map((c) => `${c.index}. ${c.title} [${c.status}]${c.summary ? ` ${c.summary}` : ''}`)
    .join('\n')
}

// ---------------------------------------------------------------- 生成历史

function loadHistory() {
  const raw = readJson(HISTORY_FILE, [])
  return Array.isArray(raw) ? raw : []
}

function appendHistory(event) {
  const list = loadHistory()
  list.unshift({ id: `bw-${Date.now().toString(36)}-${list.length + 1}`, at: nowIso(), ...event })
  writeJson(HISTORY_FILE, list.slice(0, MAX_HISTORY))
}

export function listHistory({ kind, q, limit = 50 } = {}) {
  let list = loadHistory()
  if (kind && kind !== 'all') list = list.filter((e) => e.kind === kind)
  if (q) {
    const needle = String(q).toLowerCase()
    list = list.filter((e) => `${e.project} ${e.summary} ${e.chapterTitle || ''}`.toLowerCase().includes(needle))
  }
  return list.slice(0, Math.max(1, Math.min(MAX_HISTORY, Number(limit) || 50)))
}

export function getHistory(id) {
  return loadHistory().find((e) => e.id === id) || null
}

export function clearHistory() {
  writeJson(HISTORY_FILE, [])
  return true
}

// ---------------------------------------------------------------- 统计

export function stats() {
  const store = loadStore()
  const books = store.books
  const current = books.find((b) => b.id === store.currentId) || null
  const chapters = books.reduce((n, b) => n + b.chapters.length, 0)
  const done = books.reduce((n, b) => n + b.chapters.filter((c) => c.status === 'done').length, 0)
  const history = loadHistory()
  const byStatus = { todo: 0, drafting: 0, done: 0 }
  for (const b of books) for (const c of b.chapters) byStatus[c.status] = (byStatus[c.status] || 0) + 1
  return {
    books: books.length,
    current: current ? { id: current.id, project: current.project, style: current.style } : null,
    chapters,
    done,
    drafting: byStatus.drafting,
    pct: chapters ? Math.round((done / chapters) * 100) : 0,
    events: history.length,
    lastAt: books.length ? books.map((b) => b.updatedAt || '').sort().at(-1) : null,
    lastEventAt: history.length ? history[0].at : null
  }
}
