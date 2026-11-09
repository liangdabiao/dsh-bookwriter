// ============================================================================
// 长文写作 · 浏览器半边
//   侧栏加「长文写作」入口；主区域是 /bookwriter/ 工作台页面（iframe），
//   布局对齐「投资尽调」：概览 / 我的书稿 / 生成历史 / 新建书稿 / 两种风格。
//   页面里点「新建书稿 / 继续写」时 postMessage 一段指令，这里开新对话并填进输入框。
//   明暗跟随 dsh 主题，切换时把配色发给页面。
//
// 注意：scripts/build.mjs 的 banner 已经包了一层 __ModuleLoader__ 注册，
// 这个文件只写 CJS 的 exports，不要自己再调 window.__ModuleLoader__.load。
// ============================================================================
const h = require('react').createElement
const React = require('react')

const PANEL_ID = 'bookwriter'
const LABEL = '长文写作'
const SRC = '/bookwriter/'

// 侧栏图标：摊开的书
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'
  },
    h('path', { d: 'M4 5.5c2.2-.9 4.2-.9 6 0v13c-1.8-.9-3.8-.9-6 0z' }),
    h('path', { d: 'M20 5.5c-2.2-.9-4.2-.9-6 0v13c1.8-.9 3.8-.9 6 0z' }),
    h('path', { d: 'M4 5.5v13M20 5.5v13' }))
}

function apply(ctx) {
  const frames = new Set()
  let scheme = null

  const post = (frame, payload) => {
    try { if (frame && frame.contentWindow) frame.contentWindow.postMessage(payload, location.origin) } catch { /* 已卸载 */ }
  }
  const pushScheme = () => {
    if (scheme) for (const frame of frames) post(frame, { type: 'bookwriter:scheme', scheme })
  }

  // 主题：有 theme 服务就跟随，没有就用页面自己的浅色默认
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['theme'], (c) => {
        const push = (snap) => {
          try { scheme = snap.active.colorScheme } catch { scheme = null }
          pushScheme()
        }
        try { push(c.theme.getTheme()) } catch { /* ignore */ }
        c.on('theme/change', push)
      })
    }
  } catch { /* ignore */ }

  function Panel() {
    const ref = React.useRef(null)

    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== 'bookwriter:start' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
        } catch (err) {
          console.error('[bookwriter] 开新对话失败', err)
          post(frame, { type: 'bookwriter:start-failed', message: String((err && err.message) || err) })
        }
      }
      addEventListener('message', onMessage)
      pushScheme()
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])

    return h('iframe', {
      ref,
      src: SRC,
      title: LABEL,
      allow: 'fullscreen; clipboard-write',
      onLoad: (e) => { pushScheme(); post(e.currentTarget, { type: 'bookwriter:scheme', scheme }) },
      style: { width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' }
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => LABEL }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
