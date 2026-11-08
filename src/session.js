/**
 * Per-preset first-turn prompt hook.
 *
 * Mounted inside a template preset that declares plugins. After the user's first
 * message it injects one snapshot message telling the model to check which
 * template plugins are installed (starter_check), ask the user, and only then
 * install them. Presets without plugins never mount this row.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { loadTemplates } from './templates.js'
import { COMMON_MEMBERS } from './common.js'

export const name = 'starter-session'

/** Agents already prompted in this process; a reload starts a new set. */
const prompted = new WeakSet()

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ template?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const id = config.template
  if (typeof id !== 'string' || id === '') {
    throw new Error('starter-session: config.template is required')
  }
  const templates = loadTemplates(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates'))
  const template = templates.find(entry => entry.id === id)
  if (template === undefined) throw new Error(`starter-session: unknown template ${JSON.stringify(id)}`)
  const members = (template.members ?? []).map(member => member.version === undefined ? member.name : `${member.name}@${member.version}`)
  const common = COMMON_MEMBERS.map(member => member.version === undefined ? member.name : `${member.name}@${member.version}`)
  if (members.length === 0 && common.length === 0) return

  const text = [
    `[starter] 当前是「${template.preset.name}」模式。`,
    `通用插件（任何场景都建议装）：${common.join(', ')}。`,
    `本场景插件：${members.join(', ') || '（无）'}。`,
    '在回答用户第一句话之前：',
    `1. 调用 starter_check({ template: "${template.id}" })，以工具结果为准判断是否已安装；不要凭记忆判断。`,
    '2. 如果 missing 非空，分两组列给用户：「通用插件」和「本场景插件」，说明各自作用，一次问清要不要装。',
    `3. 用户同意后调用 starter_apply({ template: "${template.id}", confirm: true, installMembers: true })。`,
    '4. 如果 missing 为空，直接回答用户，不要重复询问。',
    '5. 用户拒绝安装时不要反复劝；照常用现有能力回答，并说明缺哪个插件会影响什么。',
  ].join('\n')

  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal?.aborted) return decision
    if (turn !== 1 || step !== 1) return decision
    if (prompted.has(agent)) return decision
    prompted.add(agent)
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'starter-session', form: 'snapshot', sections: [{ name: 'starter-session', text }] },
        }),
      ],
    }
  }, { prepend: true })
}
