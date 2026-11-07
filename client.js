// ============================================================================
// 双风格长文写作 · 浏览器半边（最小面板）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'bookwriter'
const BASE = 'bookwriter'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#1a5276' }),
    h('path', { d: 'M6 7h9M6 10.5h12M6 14h8M6 17.5h5', stroke: '#fff', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
    h('path', { d: 'M17 15l2.5 2.5', stroke: '#ffd24a', 'stroke-width': 1.4, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

const STYLES = [
  ['📝 刘润风格', '商业洞察 / 方法论', '商业评论、企业案例、参访游记、5 分钟商学院体、商业格言金句', 'liurun-bookwriter'],
  ['💭 罗振宇风格', '认知 / 启发 / 商业', '认知升级、AI 时代应对、个人成长、跨年演讲体、自嘲开场、60 秒决策框架', 'luozhenyu-bookwriter'],
]

function GuideTab() {
  const [skills, setSkills] = useState(null)
  useEffect(() => {
    fetchJson('/api/skills').then((d) => setSkills(d.skills)).catch(() => {})
  }, [])
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '两种风格怎么选'),
      h('div', { style: styles.styleList },
        STYLES.map(([title, tag, desc, cmd]) => h('div', { key: cmd, style: styles.styleRow },
          h('div', null, h('span', { style: styles.styleName }, title), h('span', { style: styles.styleTag }, tag)),
          h('div', { style: styles.muted }, desc),
          h('div', { style: styles.quote }, `/${cmd} <主题>`))))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '/liurun-bookwriter 写一篇关于瑞幸咖啡商业模式的评论'),
        h('div', { style: styles.quote }, '/luozhenyu-bookwriter 写一篇 AI 时代的个人成长启发'),
        '不确定？核心问题——你的文章是"解决问题"还是"激发思考"？前者选刘润，后者选罗振宇。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '技能目录'),
      skills === null ? h('div', { style: styles.muted }, '加载中…') : null,
      skills?.map((s) => h('div', { key: s.name, style: styles.skillDesc }, `/${s.name}: ${s.description.slice(0, 80)}…`))))
}

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      h('button', { style: styles.tabActive }, '📖 风格选择')),
    h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  tabActive: { padding: '8px 16px', border: '1px solid #1a5276', borderRadius: 8, background: '#e8f0f8', color: '#1a3a5c', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#1a3a5c' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e8f0f8', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#1a3a5c', fontFamily: 'Consolas, monospace', fontSize: 12.5 },
  styleList: { display: 'grid', gap: 10 },
  styleRow: { background: '#fafafa', borderRadius: 8, padding: '10px 12px' },
  styleName: { fontWeight: 700, color: '#1a3a5c' },
  styleTag: { marginLeft: 8, padding: '1px 8px', borderRadius: 999, background: '#e8f0f8', color: '#1a3a5c', fontSize: 11 },
  muted: { color: '#8a8a92' },
  skillDesc: { padding: '4px 0', color: '#4a4a50' },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 22, label: () => '长文写作' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
