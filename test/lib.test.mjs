// dsh-bookwriter 单测（node test/lib.test.mjs 直接跑）。
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')

import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
rmSync(process.env.DSH_HOME, { recursive: true, force: true })

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err?.message?.split('\n')[0]}`) }
}

// ── data.js ─────────────────────────────────────────────────
const data = await import('../lib/data.js')

await test('data: init 建书/冲突保护/覆盖', async () => {
  const book = data.initBook('定价的常识', 'liurun-bookwriter', ['引子', '锚定', '捆绑'], false)
  assert.equal(book.chapters.length, 3)
  assert.equal(book.chapters[0].status, 'todo')
  const conflict = data.initBook('另一本', 'luozhenyu-bookwriter', ['A'], false)
  assert.equal(conflict.conflict, true)
  const over = data.initBook('另一本', 'luozhenyu-bookwriter', ['A', 'B'], true)
  assert.equal(over.chapters.length, 2)
  assert.equal(over.project, '另一本')
})

await test('data: updateChapter 更新状态/摘要/自动追加', async () => {
  const ch = data.updateChapter(2, { status: 'done', summary: '讲完锚定效应' })
  assert.equal(ch.status, 'done')
  const extra = data.updateChapter(9, { title: '番外' })
  assert.equal(extra.title, '番外')
  assert.equal(data.getBook().chapters.length, 3)
})

await test('data: clearBook', async () => {
  data.clearBook()
  assert.equal(data.getBook().chapters.length, 0)
})

// ── host.js：工具全链路 ────────────────────────────────────
const host = await import('../src/host.js')

await test('host: 工具 schema + 校验 + init/status/list/clear 全链路', async () => {
  assert.equal(host.name, 'bookwriter')
  assert.equal(host.bookwriterProjectTool.parameters.additionalProperties, false)
  await assert.rejects(() => host.bookwriterProjectTool.execute({ action: 'list', bogus: 1 }), /未知参数/)
  await assert.rejects(() => host.bookwriterProjectTool.execute({ action: 'init', project: 'x' }), /需要 project/)
  await assert.rejects(() => host.bookwriterProjectTool.execute({ action: 'init', project: 'x', style: 'bad-style', chapters: 'a' }), /只能是/)
  const init = await host.bookwriterProjectTool.execute({ action: 'init', project: '测试书', style: 'liurun-bookwriter', chapters: '一|二|三' })
  assert.equal(init.ok, true)
  const st = await host.bookwriterProjectTool.execute({ action: 'status', index: 1, status: 'done', summary: '完成' })
  assert.ok(st.summary.includes('done'))
  const list = await host.bookwriterProjectTool.execute({ action: 'list' })
  assert.ok(list.data.includes('1/3'))
  const noConfirm = await host.bookwriterProjectTool.execute({ action: 'clear' })
  assert.equal(noConfirm.ok, false)
})

// ── skills.js + api.js ─────────────────────────────────────
await test('skills: 两个风格技能可加载', async () => {
  const { createSkillProvider } = await import('../lib/skills.js')
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const list = await provider.list()
  assert.equal(list.length, 2)
  assert.ok(list.some((s) => s.name === 'liurun-bookwriter'))
  assert.ok(list.some((s) => s.name === 'luozhenyu-bookwriter'))
})

await test('api: 鉴权深度防御语义', async () => {
  const api = await import('../lib/api.js')
  assert.equal(api.requestRejection({ get: () => undefined }, { headers: {} }), false)
  assert.equal(api.requestRejection({ get: () => ({ requestRejection: () => 403 }) }, { headers: {} }), 403)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
