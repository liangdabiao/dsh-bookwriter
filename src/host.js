// 双风格长文写作 · Host 半边（技能 + bookwriter_project 原生工具 + 面板数据面）。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { getBook, initBook, updateChapter, clearBook, STYLE_NAMES, STATUSES } from '../lib/data.js'

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
// 工具：bookwriter_project —— 章节清单持久化（写长文的进度骨架）
// ---------------------------------------------------------------------------
export const bookwriterProjectTool = {
  name: 'bookwriter_project',
  description:
    '管理长文/书稿的章节清单与进度（持久化）：init 建书（项目名 + 风格 + 章节标题清单）、' +
    'status 更新某章进度（todo/drafting/done）、list 看全书进度、clear 清空重来。' +
    '写长篇时先 init 章节骨架，每写完一章用 status 记录，用户可在侧栏「长文写作」面板看进度。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('init 建书；status 更新章节；list 看进度；clear 清空', { enum: ['init', 'status', 'list', 'clear'] }),
      project: str('init：书稿/项目名'),
      style: str(`init：写作风格，${STYLE_NAMES.join(' 或 ')}`, { enum: STYLE_NAMES }),
      chapters: str('init：章节标题清单，竖线分隔，如「第一章 引子|第二章 入局|第三章 破局」'),
      index: num('status：章节序号（从 1 开始）'),
      title: str('status：可选，修正章节标题'),
      status: str('status：todo 待写 / drafting 写作中 / done 完成', { enum: STATUSES }),
      summary: str('status：可选，一句话摘要（进进度面板）'),
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
        return result(false, `已有书稿「${book.project}」共 ${book.chapters} 章。要覆盖请用 confirm:"yes" 重新 init。`)
      }
      return result(true, `书稿「${book.project}」已建立（风格 ${args.style}，共 ${titles.length} 章）。之后每写完一章用 status 更新进度；写正文时遵循 ${args.style} 技能方法论。`,
        titles.map((t, i) => `${i + 1}. ${t} [todo]`).join('\n'))
    }
    if (args.action === 'status') {
      if (!args.index) throw new Error('status 需要 index（章节序号）。')
      const chapter = updateChapter(args.index, { title: args.title, status: args.status, summary: args.summary })
      if (!chapter) return result(false, '还没有书稿，先 init。')
      return result(true, `第 ${chapter.index} 章「${chapter.title}」→ ${chapter.status}${chapter.summary ? `（${chapter.summary}）` : ''}。`)
    }
    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空书稿进度请用 confirm:"yes"。')
      clearBook()
      return result(true, '书稿进度已清空。')
    }
    // list
    const book = getBook()
    if (!book.chapters.length) return result(true, '还没有书稿。init 一个章节骨架即可开始。')
    const done = book.chapters.filter((c) => c.status === 'done').length
    return result(true, `书稿「${book.project}」（风格 ${book.style}）：${done}/${book.chapters.length} 章完成。`,
      book.chapters.map((c) => `${c.index}. ${c.title} [${c.status}]${c.summary ? ` ${c.summary}` : ''}`).join('\n'))
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(bookwriterProjectTool), `${name}: tool project`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
