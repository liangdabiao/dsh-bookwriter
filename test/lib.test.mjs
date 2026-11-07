// 双风格写作 provider + API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSkillProvider } = await import('../lib/skills.js')
const { requestRejection } = await import('../lib/api.js')

test('快照：两个风格技能（刘润 + 罗振宇）', async () => {
  assert.ok(existsSync(join(ROOT, 'skills', 'liurun-bookwriter', 'SKILL.md')), '缺刘润')
  assert.ok(existsSync(join(ROOT, 'skills', 'luozhenyu-bookwriter', 'SKILL.md')), '缺罗振宇')
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 2)
  assert.ok(candidates.some((c) => c.name === 'liurun-bookwriter'))
  assert.ok(candidates.some((c) => c.name === 'luozhenyu-bookwriter'))
})

test('正文完整：刘润 375 行、罗振宇 453 行方法论', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  for (const c of await provider.list()) {
    const skill = await provider.get(c)
    assert.ok(skill.content.length > 5000, `${c.name} 正文过短 (${skill.content.length})`)
    assert.match(skill.content, /cp -r|工作区/, '应有工作区约定')
  }
})

test('刘润/罗振宇各有独特关键词', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const list = await provider.list()
  const liurun = await provider.get(list.find((c) => c.name.includes('liurun')))
  const luo = await provider.get(list.find((c) => c.name.includes('luozhenyu')))
  assert.match(liurun.content, /飞流直下三千尺|商业洞察|方法论/)
  assert.match(luo.content, /罗胖60秒|时间的朋友|长期主义/)
})

test('面板 API 鉴权 fail closed', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), 403)
})

test('LICENSE 为 MIT', () => {
  assert.match(readFileSync(join(ROOT, 'LICENSE'), 'utf8'), /MIT/)
})
