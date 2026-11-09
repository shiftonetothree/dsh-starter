/**
 * Plugins every preset recommends.
 *
 * These are cross-scene capabilities (context compression, plugin market,
 * Python environments, model channels) rather than scenario members, so they
 * live here instead of being copied into each template. `starter_plan`,
 * `starter_check` and `starter_apply` always include them, which means the
 * first-turn prompt offers them in every scenario.
 *
 * Cosmetic plugins (themes, pets, balance widgets) deliberately stay out: they
 * are installed by the launcher for everyone and are not something to pitch on
 * every first turn.
 */

/**
 * @typedef {{ name: string, version?: string, reason?: string }} TemplateMember
 */

/** @type {readonly TemplateMember[]} */
export const COMMON_MEMBERS = Object.freeze([
  { name: 'billion-context', reason: '长会话上下文压缩，省 token，单会话可跑很久' },
  { name: 'dsh-context', reason: '上下文洞察：看 Context 组成、压缩与注入事件' },
  { name: 'dshmarket', reason: '应用内插件市场：浏览、安装、更新其它插件' },
  { name: '@michengai/dsh-skills-manager', reason: '统一加载与管理本机技能' },
  { name: 'dsh-python-env', reason: 'Python 虚拟环境管理，装包自动切国内镜像（TUNA / 阿里 / USTC）' },
  { name: 'dsh-think-translate', reason: '思考链与任务卡显示层翻译' },
  { name: 'dsh-codex-subscription', reason: '用 ChatGPT / Codex 订阅额度跑模型' },
])
