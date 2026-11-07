// 双风格长文写作 · 章节进度持久化（$DSH_HOME/bookwriter/）。
// book.json：{ project, style, chapters: [{ index, title, status, summary, updatedAt }] }
// status: todo | drafting | done
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'bookwriter')
const BOOK_FILE = join(DATA_DIR, 'book.json')
export const STYLE_NAMES = ['liurun-bookwriter', 'luozhenyu-bookwriter']
export const STATUSES = ['todo', 'drafting', 'done']

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function load() {
  try {
    const raw = JSON.parse(readFileSync(BOOK_FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

function save(book) {
  ensureDirs()
  const tmp = `${BOOK_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(book, null, 2), 'utf8')
  renameSync(tmp, BOOK_FILE)
}

export function getBook() {
  return load() || { project: '', style: '', chapters: [] }
}

// init：建立书名/风格/章节清单（覆盖重来需 confirm）。
export function initBook(project, style, chapterTitles, confirm = false) {
  const prev = load()
  if (prev && prev.chapters.length && !confirm) {
    return { conflict: true, project: prev.project, chapters: prev.chapters.length }
  }
  const book = {
    project,
    style,
    chapters: chapterTitles.map((title, i) => ({
      index: i + 1,
      title,
      status: 'todo',
      summary: '',
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  }
  save(book)
  return book
}

// 更新章节状态/摘要（不存在的章自动追加）。
export function updateChapter(index, patch) {
  const book = load()
  if (!book) return null
  let chapter = book.chapters.find((c) => c.index === index)
  if (!chapter) {
    chapter = { index, title: patch.title || `第${index}章`, status: 'todo', summary: '', updatedAt: '' }
    book.chapters.push(chapter)
    book.chapters.sort((a, b) => a.index - b.index)
  }
  if (patch.title !== undefined) chapter.title = patch.title
  if (patch.status !== undefined && STATUSES.includes(patch.status)) chapter.status = patch.status
  if (patch.summary !== undefined) chapter.summary = String(patch.summary).slice(0, 500)
  chapter.updatedAt = new Date().toISOString()
  book.updatedAt = chapter.updatedAt
  save(book)
  return chapter
}

export function clearBook() {
  save({ project: '', style: '', chapters: [] })
}
