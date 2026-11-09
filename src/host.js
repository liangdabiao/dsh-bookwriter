// 双风格长文写作 · Host 半边（技能 + bookwriter_project 原生工具 + 工作台数据面）。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import {
  getBook, getBookById, initBook, updateChapter, clearBook, listBooks, setCurrentBook,
  listHistory, stats, renderOutline, KIND_LABEL, STYLE_NAMES, STATUSES
} from '../lib/data.js'

export const name = 'bookwriter'
export const inject = ['tools', 'skills', 'webServer', 'connection']

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`bookwriter_project 参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：章节清单/详情' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具：bookwriter_project —— 书稿骨架 + 章节进度（写长文的进度骨架）
// ---------------------------------------------------------------------------
export const bookwriterProjectTool = {
  name: 'bookwriter_project',
  description:
    '管理长文/书稿的章节清单与进度（持久化，多本书）：init 建书（项目名 + 风格 + 章节标题清单，覆盖旧书要 confirm，旧书转归档可切回）、' +
    'status 更新某章进度（todo/drafting/done + 一句话摘要）、list 看当前书进度、books 看全部书稿（含归档）、' +
    'current 切换到某本书继续写、history 看生成历史、stats 汇总、clear 清空当前书（转归档）。' +
    '写长篇时先 init 章节骨架，每写完一章用 status 记录，用户可在侧栏「长文写作」工作台看进度。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('init 建书；status 更新章节；list 当前书进度；books 全部书稿；current 切换当前书；history 生成历史；stats 汇总；clear 清空当前书', { enum: ['init', 'status', 'list', 'books', 'current', 'history', 'stats', 'clear'] }),
      project: str('init：书稿/项目名'),
      style: str(`init：写作风格，${STYLE_NAMES.join(' 或 ')}`, { enum: STYLE_NAMES }),
      chapters: str('init：章节标题清单，竖线分隔，如「第一章 引子|第二章 入局|第三章 破局」'),
      index: num('status：章节序号（从 1 开始）'),
      title: str('status：可选，修正章节标题'),
      status: str('status：todo 待写 / drafting 写作中 / done 完成', { enum: STATUSES }),
      summary: str('status：可选，一句话摘要（进进度面板）'),
      id: str('current：书稿 id（books 里能看到）'),
      kind: str('history：只看某一类事件', { enum: ['all', 'init', 'replace', 'status', 'clear', 'switch', 'delete'] }),
      q: str('history：关键词（书名/摘要）'),
      limit: num('history：最多几条，默认 20'),
      confirm: str('init 覆盖已有书稿 / clear 清空，都要传 "yes"', { enum: ['yes'] }),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)

    if (args.action === 'init') {
      if (!args.project || !args.style || !args.chapters) throw new Error('init 需要 project、style、chapters（竖线分隔的章节标题）。')
      const titles = args.chapters.split('|').map((t) => t.trim()).filter(Boolean)
      if (!titles.length) throw new Error('chapters 至少要有一个章节标题。')
      const book = initBook(args.project, args.style, titles, args.confirm === 'yes')
      if (book.conflict) {
        return result(false, `已有书稿「${book.project}」共 ${book.chapters} 章。要覆盖请用 confirm:"yes" 重新 init（旧书会转归档，可用 current 切回）。`)
      }
      return result(true, `书稿「${book.project}」已建立（风格 ${args.style}，共 ${titles.length} 章）。之后每写完一章用 status 更新进度；写正文时遵循 ${args.style} 技能方法论。`,
        titles.map((t, i) => `${i + 1}. ${t} [todo]`).join('\n'))
    }

    if (args.action === 'status') {
      if (!args.index) throw new Error('status 需要 index（章节序号）。')
      const chapter = updateChapter(args.index, { title: args.title, status: args.status, summary: args.summary })
      if (!chapter) return result(false, '还没有当前书稿，先 init（或用 books 看已有书稿、current 切过去）。')
      return result(true, `第 ${chapter.index} 章「${chapter.title}」→ ${chapter.status}${chapter.summary ? `（${chapter.summary}）` : ''}。`)
    }

    if (args.action === 'books') {
      const books = listBooks()
      if (!books.length) return result(true, '还没有书稿。init 一本即可开始。')
      return result(true, `共 ${books.length} 本书稿${books.some((b) => b.current) ? '（★ 为当前书）' : ''}：`,
        books.map((b) => `${b.current ? '★' : ' '} ${b.project}（${b.style}，${b.done}/${b.chapters} 章${b.archivedAt ? '，归档' : ''}，id=${b.id}）`).join('\n'))
    }

    if (args.action === 'current') {
      if (!args.id) throw new Error('current 需要 id（books 里能看到）。')
      const book = setCurrentBook(args.id)
      if (!book) return result(false, `没有书稿 ${args.id}。`)
      return result(true, `当前书已切到「${book.project}」（${book.done ?? book.chapters.filter((c) => c.status === 'done').length}/${book.chapters.length} 章）。`, renderOutline(book))
    }

    if (args.action === 'history') {
      const events = listHistory({ kind: args.kind || 'all', q: args.q, limit: Math.min(100, Number(args.limit) || 20) })
      if (!events.length) return result(true, '还没有历史记录', 'init / status / clear 之后这里会留记录。')
      return result(true, `最近 ${events.length} 条书稿历史：`,
        events.map((e) => `- ${String(e.at).slice(0, 16).replace('T', ' ')} ${KIND_LABEL[e.kind] || e.kind}｜${e.project}｜${e.summary}｜id=${e.id}`).join('\n'))
    }

    if (args.action === 'stats') {
      const s = stats()
      return result(true, `共 ${s.books} 本书稿、${s.chapters} 章（完成 ${s.done}，写作中 ${s.drafting}，${s.pct}%）`, [
        s.current ? `当前书：${s.current.project}（${s.current.style}）` : '当前没有选中的书（用 current 切一本）',
        `历史事件 ${s.events} 条${s.lastEventAt ? `，最近 ${String(s.lastEventAt).replace('T', ' ').slice(0, 16)}` : ''}`
      ].join('\n'))
    }

    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空书稿进度请用 confirm:"yes"。')
      const book = getBook()
      clearBook()
      return result(true, book.chapters.length ? `当前书稿「${book.project}」已清空并转入归档（可在工作台切回）。` : '当前没有书稿。')
    }

    if (args.action === 'list') {
      const book = getBook()
      if (!book.chapters.length) return result(true, '还没有当前书稿。init 一个章节骨架即可开始（或用 books 看已有书稿、current 切过去）。')
      const done = book.chapters.filter((c) => c.status === 'done').length
      return result(true, `书稿「${book.project}」（风格 ${book.style}）：${done}/${book.chapters.length} 章完成。`, renderOutline(book))
    }

    // 兜底：未知 action 已在 check 的 enum 里挡掉，这里不会走到
    throw new Error(`未知 action：${args.action}`)
  },
}

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  ctx.effect(() => ctx.tools.register(bookwriterProjectTool), `${name}: tool project`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}

// 给测试用：把 id 查询顺手导出，避免测试再 import 一次 data.js
export { getBookById }
