/**
 * Build an agent preset that inherits the shipped `standard` preset.
 *
 * Templates only contribute identity and persona. Every tool, skill, plan-mode,
 * compaction, and delegation row comes from the standard preset's own
 * declaration, so the starter never redefines the standard composition.
 */

const PERSONA = '@deepseek-ai/dsh-persona'

/**
 * Clone one preset's declared plugin list so per-template edits cannot mutate
 * the standard definition.
 * @param {readonly Record<string, unknown>[]} plugins
 * @returns {Array<Record<string, unknown>>}
 */
function cloneRows(plugins) {
  return plugins.map(row => {
    const copy = { ...row }
    if ('config' in copy) {
      try {
        copy.config = structuredClone(copy.config)
      } catch {
        // A non-cloneable config object is shared read-only.
      }
    }
    return copy
  })
}

/**
 * Build a preset definition by cloning the standard composition and replacing
 * its persona. Nothing else is duplicated or redefined.
 * @param {import('./templates.js').Template} template
 * @param {readonly Record<string, unknown>[]} standardPlugins - the live `standard` preset's declared rows.
 * @param {string} [sessionModuleUrl] - URL of the session prompt plugin, required when the template has members.
 * @returns {{ id: string, name: string, description: string, order?: number, plugins: Array<Record<string, unknown>> }}
 */
export function buildPresetDefinition(template, standardPlugins, sessionModuleUrl) {
  if (!Array.isArray(standardPlugins) || standardPlugins.length === 0) {
    throw new Error('starter: cannot inherit the standard preset; the profile does not declare one')
  }
  const rows = cloneRows(standardPlugins)
  const persona = { id: 'persona', name: PERSONA, config: { prefix: template.preset.persona } }
  const index = rows.findIndex(row => row.id === 'persona' || row.name === PERSONA)
  if (index === -1) rows.unshift(persona)
  else rows[index] = persona

  // A template with plugins needs one extra row: a prompt hook that tells the
  // model to check installation after the first user message.
  if ((template.members ?? []).length > 0) {
    if (sessionModuleUrl === undefined) {
      throw new Error('starter: a template with members needs the session prompt module')
    }
    rows.push({ id: 'starter-session', name: sessionModuleUrl, config: { template: template.id } })
  }

  const preset = template.preset
  return {
    id: preset.id,
    name: preset.name,
    description: template.description,
    ...(preset.order === undefined ? {} : { order: preset.order }),
    plugins: rows,
  }
}

/**
 * Wait for the standard preset's declared rows to appear in the registry.
 *
 * The starter inherits `standard`, but preset declarations and the starter row
 * activate independently: on a cold boot the starter can run before the
 * `@deepseek-ai/dsh-agent-preset` rows finish registering. The registry exposes
 * no public accessor for declarations, so this reads its definition map and
 * polls briefly; callers must treat the result as read-only.
 * @param {{ definitions?: Map<string, { config?: { plugins?: readonly Record<string, unknown>[] } }> }} registry
 * @param {number} [timeoutMs]
 * @returns {Promise<readonly Record<string, unknown>[]>}
 */
export async function waitForStandard(registry, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const plugins = registry?.definitions?.get('standard')?.config?.plugins
    if (Array.isArray(plugins) && plugins.length > 0) return plugins
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const available = [...(registry?.definitions?.keys?.() ?? [])].join(', ') || '(none)'
  throw new Error(`starter: the standard agent preset is unavailable; cannot inherit its composition (available: ${available})`)
}
