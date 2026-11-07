// ============================================================================
// 双风格长文写作 · 浏览器半边（书稿进度 / 风格 / 指南 三标签面板）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'bookwriter'
const BASE = 'bookwriter'
const STATUS_STYLE = {
  todo: ['#8a8a92', '○ 待写'],
  drafting: ['#b58a00', '✎ 写作中'],
  done: ['#1a7f37', '✓ 完成'],
}

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#5b3a8e' }),
    h('path', { d: 'M7 17V8l2.5 3L12 8l2.5 3L17 8v9', stroke: '#d6c7f0', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function ProgressTab() {
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/book').then((d) => setBook(d.book)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (book === null) return h('div', { style: styles.muted }, '加载中…')
  if (!book.chapters.length) {
    return h('div', { style: styles.muted },
      '还没有书稿。在对话里说「用刘润风格写一本关于定价的小册子，10 章」，模型会 init 章节骨架并逐章推进。')
  }
  const done = book.chapters.filter((c) => c.status === 'done').length
  const pct = Math.round((done / book.chapters.length) * 100)
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, `📘 ${book.project}`),
      h('div', { style: styles.mutedSmall }, `风格：${book.style} · ${done}/${book.chapters.length} 章完成（${pct}%）`),
      h('div', { style: styles.barWrap }, h('div', { style: { ...styles.bar, width: `${pct}%` } }))),
    h('div', { style: styles.card },
      book.chapters.map((c) => {
        const [color, label] = STATUS_STYLE[c.status] || STATUS_STYLE.todo
        return h('div', { key: c.index, style: styles.chapter },
          h('span', { style: { color, fontSize: 12, fontWeight: 700, minWidth: 62 } }, label),
          h('span', { style: styles.chapterTitle }, `${c.index}. ${c.title}`),
          c.summary ? h('div', { style: styles.mutedSmall }, c.summary) : null)
      })))
}

function StylesTab() {
  const [stylesList, setStyles] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/styles').then((d) => setStyles(d.styles)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (stylesList === null) return h('div', { style: styles.muted }, '加载中…')
  const labels = { 'liurun-bookwriter': '刘润风格', 'luozhenyu-bookwriter': '罗振宇风格' }
  return h('div', null, stylesList.map((s) => h('div', { key: s.name, style: styles.card },
    h('div', { style: styles.sectionTitle }, labels[s.name] || s.name),
    h('div', { style: styles.mutedSmall }, s.description || ''))))
}

function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '「用刘润风格写一本《定价的常识》小册子，8 章」'),
        h('div', { style: styles.quote }, '「用罗振宇风格写一份 20 节的商业思维专栏大纲」'),
        '模型 init 章节骨架 → 逐章按风格方法论写正文 → 每章完成用 status 记录 → 进度在这里可见。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '1 个工具'),
      h('div', { style: styles.muted, lineHeight: 2 },
        h('b', null, 'bookwriter_project'), ' — init 建书（风格+章节清单）/ status 更新章节进度 / list 看全书 / clear 清空。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '两种风格'),
      h('div', { style: styles.muted, lineHeight: 1.8 },
        '刘润风格——商业洞察、结构化拆解、金句收尾；罗振宇风格——故事开场、跨域联想、口语化转述。写作时模型自动加载对应方法论。')))
}

const TABS = [['progress', '书稿进度'], ['styles', '风格'], ['guide', '指南']]

function Panel() {
  const [tab, setTab] = useState('progress')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => setTab(id),
      }, label))),
    tab === 'progress' ? h(ProgressTab) : tab === 'styles' ? h(StylesTab) : h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #5b3a8e', borderRadius: 8, background: '#f0eaf9', color: '#5b3a8e', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#f0eaf9', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#5b3a8e' },
  muted: { color: '#8a8a92', lineHeight: 1.8 },
  mutedSmall: { color: '#a0a0a8', fontSize: 12, lineHeight: 1.7 },
  error: { color: '#c0392b', padding: 12 },
  barWrap: { background: '#eee', borderRadius: 999, height: 8, marginTop: 8, overflow: 'hidden' },
  bar: { background: '#5b3a8e', height: '100%', borderRadius: 999, transition: 'width .3s' },
  chapter: { padding: '6px 0', borderBottom: '1px solid #f0f0f2' },
  chapterTitle: { fontSize: 12.5 },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => '长文写作' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
