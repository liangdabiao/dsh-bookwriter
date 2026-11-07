// 离线自检。零网络零 key。
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSkillProvider } = await import('../lib/skills.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try { await fn(); console.log('ok') } catch (err) { failed++; console.log('失败'); console.error(`  ${err.message}`) }
}

await step('双技能快照 + 正文完整', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  if (candidates.length !== 2) throw new Error(`候选 ${candidates.length} ≠ 2`)
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (skill.content.length < 5000) throw new Error(`${c.name} 正文过短`)
  }
})

await step('面板 API 健康（内存 ctx 模拟）', async () => {
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = { get: () => ({ requestRejection: () => false }), webServer: { register: async ({ handler }) => { globalThis.__bwHandler = handler } } }
  await registerApi(fakeCtx, { skillDirs: [join(ROOT, 'skills')] })
  await globalThis.__bwHandler({ method: 'GET', url: '/bookwriter/api/health', headers: {} }, fakeRes)
  if (!JSON.parse(captured.at(-1)).ok) throw new Error('health 错误')
})

if (failed > 0) { console.error(`\n自检失败 ${failed} 项`); process.exit(1) }
console.log('\n全部通过。')
