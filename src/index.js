/**
 * dsh-starter host plugin.
 *
 * Templates are data. At mount the starter registers one agent preset per
 * template, so using a template means selecting that preset (and, optionally,
 * installing the plugins it declares). The starter writes nothing into the
 * working directory.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadTemplates } from './templates.js'
import { COMMON_MEMBERS } from './common.js'
import { buildPresetDefinition, waitForStandard } from './presets.js'
import { installOne, memberSpec, partitionMembers, removeMembers, setMembersEnabled } from './install.js'

export const name = 'starter'
export const inject = ['tools', 'agentPresets']
export const VERSION = '0.6.0'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const templatesDir = join(packageRoot, 'templates')

/**
 * Record which module the running Host actually loaded. Diagnostics only; a
 * failure to write never affects the plugin.
 * @returns {void}
 */
function markMount() {
  try {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
    const dir = join(home, 'state')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'starter-mount.json'), `${JSON.stringify({
      at: new Date().toISOString(),
      version: VERSION,
      file: import.meta.url,
      pid: process.pid,
    }, null, 2)}\n`, 'utf8')
  } catch {
    // A diagnostics write must never break activation.
  }
}

export async function apply(ctx) {
  markMount()
  const templates = loadTemplates(templatesDir)
  const byId = new Map(templates.map(template => [template.id, template]))

  // Preset registration is best-effort and asynchronous: the tools must mount
  // even when the standard preset is late or broken, and starter_diagnose
  // reports why registration failed.
  const diagnostics = { registered: [], errors: [], standardAvailable: false }
  const disposePresets = []
  ctx.effect(() => () => {
    for (const dispose of disposePresets) void dispose()
  }, 'starter.presets')

  const find = id => {
    const template = byId.get(id)
    if (template === undefined) {
      throw new Error(`unknown template ${JSON.stringify(id)}; available: ${[...byId.keys()].join(', ')}`)
    }
    return template
  }

  const list = () => templates

  /**
   * Scenario members first, then the common ones, so the plugins the user
   * actually asked for are offered (and installed) before the general ones.
   * @param {import('./templates.js').Template} template
   * @returns {readonly import('./templates.js').TemplateMember[]}
   */
  const membersOf = template => [...(template.members ?? []), ...COMMON_MEMBERS]

  const plan = id => {
    const template = find(id)
    return {
      preset: template.preset.id,
      presetName: template.preset.name,
      members: membersOf(template).map(memberSpec),
      ...(template.firstTask === undefined ? {} : { firstTask: template.firstTask }),
    }
  }

  const check = async id => {
    const template = find(id)
    const manager = ctx.get('pluginManager')
    if (manager === undefined) {
      throw new Error('starter: this profile has no plugin manager; check the Plugins page instead')
    }
    const bundles = await manager.listBundles()
    const byName = new Map(bundles.map(bundle => [bundle.name, bundle]))
    const members = membersOf(template).map(member => {
      const info = byName.get(member.name)
      return {
        spec: memberSpec(member),
        installed: info?.installed === true,
        enabled: info?.enabled === true,
        availability: info?.availability ?? 'missing',
        ...(info?.version === undefined ? {} : { version: info.version }),
      }
    })
    return {
      template: template.id,
      preset: template.preset.id,
      members,
      missing: members.filter(member => !member.installed).map(member => member.spec),
    }
  }

  const diagnose = () => ({
    version: VERSION,
    pluginFile: import.meta.url,
    manager: ctx.get('pluginManager') !== undefined,
    standardAvailable: diagnostics.standardAvailable,
    registered: [...diagnostics.registered],
    errors: [...diagnostics.errors],
    definitions: [...(ctx.agentPresets.definitions?.keys?.() ?? [])],
    templates: templates.map(template => ({
      id: template.id,
      preset: template.preset.id,
      members: template.members?.length ?? 0,
      common: COMMON_MEMBERS.length,
    })),
  })

  const run = async (id, options = {}) => {
    const template = find(id)
    if (options.confirm !== true) {
      throw new Error('starter_apply requires confirm: true; call starter_plan first and show the plan to the user')
    }
    return {
      preset: template.preset.id,
      members: membersOf(template).map(memberSpec),
      ...(template.firstTask === undefined ? {} : { firstTask: template.firstTask }),
      note: options.installMembers === true
        ? 'installMembers is ignored: install one plugin per starter_install call, not a batch.'
        : undefined,
    }
  }

  /**
   * Install exactly one member. The model loops; each call is its own chunk of
   * work so the rest of DSH is not blocked for a whole batch.
   */
  const installNext = async (id, options = {}) => {
    const template = find(id)
    if (options.confirm !== true) {
      throw new Error('starter_install requires confirm: true; ask the user first')
    }
    const manager = ctx.get('pluginManager')
    if (manager === undefined) {
      throw new Error('starter: this profile has no plugin manager; install plugins from the Plugins page')
    }
    const members = membersOf(template)
    const bundles = await manager.listBundles()
    const installedNames = new Set(bundles.filter(bundle => bundle.installed === true).map(bundle => bundle.name))
    let pending = members.filter(member => !installedNames.has(member.name))

    if (options.member !== undefined) {
      const wanted = pending.find(member => member.name === options.member)
      if (wanted === undefined) {
        throw new Error(`${JSON.stringify(options.member)} is not pending for template ${JSON.stringify(id)}; it is either already installed or not part of this template`)
      }
      pending = [wanted, ...pending.filter(member => member.name !== wanted.name)]
    }

    if (pending.length === 0) {
      return {
        template: template.id,
        preset: template.preset.id,
        spec: '',
        ok: true,
        remaining: [],
        installed: members.length,
        total: members.length,
        done: true,
      }
    }

    const result = await installOne(manager, pending[0])
    const remaining = (result.ok ? pending.slice(1) : pending).map(memberSpec)
    return {
      template: template.id,
      preset: template.preset.id,
      spec: result.spec,
      ok: result.ok,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      remaining,
      installed: members.length - remaining.length,
      total: members.length,
      done: remaining.length === 0,
    }
  }

  const sharedTemplates = (id, template) => {
    const names = new Set(membersOf(template).map(member => member.name))
    return templates
      .filter(other => other.id !== id && membersOf(other).some(member => names.has(member.name)))
      .map(other => other.id)
  }

  const uninstall = async (id, options = {}) => {
    const template = find(id)
    const members = membersOf(template).map(memberSpec)
    const sharedWith = sharedTemplates(id, template)
    const choice = options.membersAction

    if (choice !== undefined && choice !== 'keep' && choice !== 'remove') {
      throw new Error('membersAction must be "keep" or "remove"')
    }

    if (options.confirm !== true) {
      return {
        dryRun: true,
        preset: template.preset.id,
        members,
        sharedWithTemplates: sharedWith,
        removedMembers: [],
      }
    }

    if (choice === undefined) {
      throw new Error('choose whether to keep or remove the template plugins first: ask the user, then pass membersAction "keep" or "remove"')
    }

    const removedMembers = choice === 'remove'
      ? await removeMembers(ctx.get('pluginManager'), membersOf(template))
      : []

    return {
      dryRun: false,
      preset: template.preset.id,
      members,
      membersAction: choice,
      sharedWithTemplates: sharedWith,
      removedMembers,
    }
  }

  const setPlugins = async (id, enabled, options = {}) => {
    const template = find(id)
    const { toggleable, protectedMembers: protectedOnes } = partitionMembers(membersOf(template))
    const skippedProtected = protectedOnes.map(member => member.name)
    if (options.confirm !== true) {
      return { dryRun: true, enabled, members: toggleable.map(memberSpec), skippedProtected, results: [] }
    }
    const results = await setMembersEnabled(ctx.get('pluginManager'), toggleable, enabled)
    return { dryRun: false, enabled, members: toggleable.map(memberSpec), skippedProtected, results }
  }

  ctx.provide('starter', { list, plan, check, diagnose, run, installNext, uninstall, setPlugins })

  ctx.tools.register(defineTool({
    name: 'starter_list',
    description: 'List the available starter templates. Each template is an agent preset; call this before starter_plan.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          templates: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                description: { type: 'string', required: true },
                preset: { type: 'string', required: true },
                members: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.templates.map(t => `${t.id}: ${t.title} -> preset ${t.preset} - ${t.description}`).join('\n'),
      }],
    },
    execute() {
      return {
        templates: templates.map(template => ({
          id: template.id,
          title: template.title,
          description: template.description,
          preset: template.preset.id,
          members: membersOf(template).length,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_plan',
    description: 'Show the preset and plugins a starter template would provide, without changing anything.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preset: { type: 'string', required: true },
          presetName: { type: 'string', required: true },
          members: { type: 'array', required: true, items: { type: 'string' } },
          firstTask: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Preset: ${value.presetName} (${value.preset})`,
          `Plugins: ${value.members.join(', ') || '(none)'}`,
          value.firstTask === undefined ? '' : `First task: ${value.firstTask}`,
        ].filter(Boolean).join('\n'),
      }],
    },
    execute(args) {
      return plan(args.template)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_check',
    description: 'Report whether the plugins a template needs are installed in this profile. Read-only: it never installs anything.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          template: { type: 'string', required: true },
          preset: { type: 'string', required: true },
          members: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                spec: { type: 'string', required: true },
                installed: { type: 'boolean', required: true },
                enabled: { type: 'boolean', required: true },
                availability: { type: 'string', required: true },
                version: { type: 'string' },
              },
            },
          },
          missing: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.members.length === 0
          ? `Template ${value.template} needs no plugins.`
          : [
            `Template ${value.template} (preset ${value.preset})`,
            ...value.members.map(member => `- ${member.spec}: ${member.installed ? (member.enabled ? 'installed, enabled' : 'installed, disabled') : `not installed (${member.availability})`}`),
            value.missing.length === 0 ? 'All plugins are installed.' : `Missing: ${value.missing.join(', ')}`,
          ].join('\n'),
      }],
    },
    execute(args) {
      return check(args.template)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_apply',
    description: 'Activate a starter template: it becomes available as an agent preset, and its plugins can be installed after the user confirms.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
      confirm: { type: 'boolean', required: true, description: 'Must be true; set only after the user approved the plan.' },
      installMembers: { type: 'boolean', description: 'Deprecated and ignored: plugins are installed one per starter_install call.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preset: { type: 'string', required: true },
          members: { type: 'array', required: true, items: { type: 'string' } },
          firstTask: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Preset ready: ${value.preset}`,
          value.members.length === 0 ? '' : `Plugins to install one by one (${value.members.length}): ${value.members.join(', ')}`,
          value.firstTask === undefined ? '' : `First task: ${value.firstTask}`,
          value.note === undefined ? '' : `Note: ${value.note}`,
        ].filter(Boolean).join('\n'),
      }],
    },
    async execute(args) {
      return run(args.template, {
        confirm: args.confirm === true,
        installMembers: args.installMembers === true,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_install',
    description: 'Install exactly ONE plugin of a starter template, then report what is left. Call it once per plugin, waiting for each result: a batch install blocks every other DSH task. When remaining is empty the template is fully installed.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
      confirm: { type: 'boolean', required: true, description: 'Must be true; set only after the user agreed to install.' },
      member: { type: 'string', description: 'Optional exact package name to install next. Omit to take the first pending plugin in template order.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          template: { type: 'string', required: true },
          preset: { type: 'string', required: true },
          spec: { type: 'string', required: true },
          ok: { type: 'boolean', required: true },
          detail: { type: 'string' },
          remaining: { type: 'array', required: true, items: { type: 'string' } },
          installed: { type: 'integer', required: true },
          total: { type: 'integer', required: true },
          done: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.done && value.spec === ''
          ? `Nothing to install for ${value.template}: all ${value.total} plugins are already installed.`
          : [
            `${value.spec} ${value.ok ? 'installed' : `failed (${value.detail ?? 'unknown'})`}`,
            `Progress: ${value.installed}/${value.total}`,
            value.remaining.length === 0 ? 'All plugins installed.' : `Next (${value.remaining.length} left): ${value.remaining.join(', ')}`,
          ].join('\n'),
      }],
    },
    async execute(args) {
      return installNext(args.template, {
        confirm: args.confirm === true,
        member: args.member,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_remove',
    description: 'Uninstall a starter template: preview first (confirm omitted), then remove only its plugins. The preset stays available while the starter plugin is installed. The user must choose whether the template\'s plugins are kept or removed; never decide that for them.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
      confirm: { type: 'boolean', description: 'Set only after the user approved the preview. Default false (preview).' },
      membersAction: {
        type: 'string',
        enum: ['keep', 'remove'],
        description: 'Required when confirm is true. "keep" leaves the template plugins installed; "remove" uninstalls them. Ask the user and pass their choice verbatim.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dryRun: { type: 'boolean', required: true },
          preset: { type: 'string', required: true },
          members: { type: 'array', required: true, items: { type: 'string' } },
          membersAction: { type: 'string', enum: ['keep', 'remove'] },
          sharedWithTemplates: { type: 'array', required: true, items: { type: 'string' } },
          removedMembers: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                spec: { type: 'string', required: true },
                ok: { type: 'boolean', required: true },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.dryRun
          ? [
            `Preview: template preset ${value.preset} stays available`,
            `Template plugins: ${value.members.join(', ') || '(none)'} 鈥?ask the user whether to keep or remove them`,
            value.sharedWithTemplates.length === 0 ? '' : `Also declared by: ${value.sharedWithTemplates.join(', ')}`,
          ].filter(Boolean).join('\n')
          : [
            `Preset ${value.preset} stays available`,
            `Plugins: ${value.membersAction === 'remove' ? (value.removedMembers.map(member => `${member.spec} ${member.ok ? 'removed' : `failed (${member.detail ?? 'unknown'})`}`).join(', ') || '(none)') : 'kept'}`,
          ].filter(Boolean).join('\n'),
      }],
    },
    async execute(args) {
      return uninstall(args.template, {
        confirm: args.confirm === true,
        membersAction: args.membersAction,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_set_plugins',
    description: 'Enable or disable every plugin declared by one template, without uninstalling them. The starter plugin itself is always skipped, so it can never disable the tools that would re-enable it. Omit confirm to preview.',
    parameters: {
      template: { type: 'string', required: true, description: 'Template id from starter_list.' },
      enabled: { type: 'boolean', required: true, description: 'true enables the template plugins, false disables them.' },
      confirm: { type: 'boolean', description: 'Set only after the user approved the preview. Default false (preview).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dryRun: { type: 'boolean', required: true },
          enabled: { type: 'boolean', required: true },
          members: { type: 'array', required: true, items: { type: 'string' } },
          skippedProtected: { type: 'array', required: true, items: { type: 'string' } },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                spec: { type: 'string', required: true },
                ok: { type: 'boolean', required: true },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.dryRun
          ? [
            `Would ${value.enabled ? 'enable' : 'disable'}: ${value.members.join(', ') || '(none)'}`,
            value.skippedProtected.length === 0 ? '' : `Always kept enabled: ${value.skippedProtected.join(', ')}`,
          ].filter(Boolean).join('\n')
          : [
            `${value.enabled ? 'Enabled' : 'Disabled'}: ${value.results.map(result => `${result.spec} ${result.ok ? 'ok' : `failed (${result.detail ?? 'unknown'})`}`).join(', ') || '(none)'}`,
            value.skippedProtected.length === 0 ? '' : `Always kept enabled: ${value.skippedProtected.join(', ')}`,
          ].filter(Boolean).join('\n'),
      }],
    },
    async execute(args) {
      return setPlugins(args.template, args.enabled, { confirm: args.confirm === true })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'starter_diagnose',
    description: 'Report why starter presets are or are not registered: registry keys, standard availability, registration results and errors.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { json: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.json }],
    },
    execute() {
      return { json: JSON.stringify(diagnose(), null, 2) }
    },
  }))

  // Presets are registered after the tools are mounted, so a slow or missing
  // `standard` never takes the whole plugin down; starter_diagnose shows why.
  void (async () => {
    const sessionModuleUrl = new URL('./session.js', import.meta.url).href
    try {
      const standardPlugins = await waitForStandard(ctx.agentPresets, 30000)
      diagnostics.standardAvailable = true
      for (const template of templates) {
        try {
          disposePresets.push(await ctx.agentPresets.register(buildPresetDefinition(template, standardPlugins, sessionModuleUrl)))
          diagnostics.registered.push(template.preset.id)
        } catch (error) {
          diagnostics.errors.push({ template: template.id, error: error instanceof Error ? error.message : String(error) })
        }
      }
      if (process.env.DSH_STARTER_DEBUG === '1') {
        console.error(`starter: presets registered=${diagnostics.registered.join(', ') || '(none)'} errors=${JSON.stringify(diagnostics.errors)}`)
      }
    } catch (error) {
      diagnostics.errors.push({ template: '*', error: error instanceof Error ? error.message : String(error) })
      if (process.env.DSH_STARTER_DEBUG === '1') {
        console.error(`starter: preset registration failed: ${diagnostics.errors.at(-1).error}`)
      }
    }
  })()

  if (process.env.DSH_STARTER_DEBUG === '1') {
    const ids = templates.map(template => template.id).join(', ')
    const presets = templates.map(template => template.preset.id).join(', ')
    console.error(`starter: mounted; templates=${ids}; presets=${presets}; tools=starter_list,starter_plan,starter_check,starter_diagnose,starter_apply,starter_remove,starter_set_plugins`)
  }
}
