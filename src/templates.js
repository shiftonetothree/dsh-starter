/**
 * Template loading and validation, independent of Cordis so it can be unit-tested
 * with plain `node --test`.
 *
 * A template is data: it names a preset (persona + display fields) and the
 * plugins that preset needs. Nothing here touches the filesystem.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** @typedef {{ id: string, name: string, order?: number, persona: string }} TemplatePreset */
/** @typedef {{ id: string, title: string, description: string, preset: TemplatePreset, members?: Array<{ name: string, version?: string, reason?: string }>, firstTask?: string }} Template */

/**
 * Validate one template manifest.
 * @param {unknown} value
 * @param {string} file
 * @returns {Template}
 */
export function validateTemplate(value, file = 'template') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${file}: template must be an object`)
  }
  const template = /** @type {Record<string, unknown>} */ (value)
  for (const key of ['id', 'title', 'description']) {
    if (typeof template[key] !== 'string' || template[key].trim() === '') {
      throw new Error(`${file}: "${key}" must be a non-empty string`)
    }
  }
  const preset = template.preset
  if (typeof preset !== 'object' || preset === null || Array.isArray(preset)) {
    throw new Error(`${file}: "preset" must be an object`)
  }
  const record = /** @type {Record<string, unknown>} */ (preset)
  for (const key of ['id', 'name', 'persona']) {
    if (typeof record[key] !== 'string' || record[key].trim() === '') {
      throw new Error(`${file}: "preset.${key}" must be a non-empty string`)
    }
  }
  if (record.order !== undefined && (typeof record.order !== 'number' || !Number.isFinite(record.order))) {
    throw new Error(`${file}: "preset.order" must be a finite number`)
  }
  if (template.members !== undefined && !Array.isArray(template.members)) {
    throw new Error(`${file}: "members" must be an array`)
  }
  return /** @type {Template} */ (template)
}

/**
 * Load every `*.json` template from a directory, sorted by id.
 * @param {string} dir
 * @returns {Template[]}
 */
export function loadTemplates(dir) {
  const files = readdirSync(dir).filter(file => file.endsWith('.json')).sort()
  const templates = files.map(file => validateTemplate(JSON.parse(readFileSync(join(dir, file), 'utf8')), file))
  const ids = new Set()
  const presetIds = new Set()
  for (const template of templates) {
    if (ids.has(template.id)) throw new Error(`duplicate template id: ${template.id}`)
    ids.add(template.id)
    if (presetIds.has(template.preset.id)) throw new Error(`duplicate preset id: ${template.preset.id}`)
    presetIds.add(template.preset.id)
  }
  return templates
}
