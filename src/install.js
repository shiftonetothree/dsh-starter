/**
 * Member installation through the profile's plugin manager.
 *
 * Members are installed one at a time, in declaration order, and the loop stops
 * at the first failure so a partially applied template reports honestly instead
 * of pretending every member arrived.
 */

/**
 * Turn a template member into a pnpm spec the plugin manager accepts.
 * @param {{ name: string, version?: string }} member
 * @returns {string}
 */
export function memberSpec(member) {
  return member.version === undefined ? member.name : `${member.name}@${member.version}`
}

/**
 * @param {{ installBundle: (spec: string, options?: { enabled?: boolean }) => Promise<unknown> } | undefined} manager
 * @param {Array<{ name: string, version?: string, reason?: string }>} members
 * @returns {Promise<Array<{ spec: string, ok: boolean, detail?: string }>>}
 */
export async function installMembers(manager, members) {
  if (manager === undefined) {
    throw new Error('starter: this profile has no plugin manager; install members manually with `dsh plugin add`')
  }
  const results = []
  for (const member of members) {
    const spec = memberSpec(member)
    try {
      await manager.installBundle(spec, { enabled: true })
      results.push({ spec, ok: true })
    } catch (error) {
      results.push({ spec, ok: false, detail: error instanceof Error ? error.message : String(error) })
      break
    }
  }
  return results
}

/**
 * Remove template members through the profile's plugin manager, one at a time.
 * Only the package name is removed (not a versioned spec); the loop stops at the
 * first failure so a partially removed template is reported honestly.
 * @param {{ removeBundle: (name: string) => Promise<unknown> } | undefined} manager
 * @param {Array<{ name: string, version?: string, reason?: string }>} members
 * @returns {Promise<Array<{ spec: string, ok: boolean, detail?: string }>>}
 */
export async function removeMembers(manager, members) {
  if (manager === undefined) {
    throw new Error('starter: this profile has no plugin manager; remove members manually with `dsh plugin remove`')
  }
  const results = []
  for (const member of members) {
    try {
      await manager.removeBundle(member.name)
      results.push({ spec: member.name, ok: true })
    } catch (error) {
      results.push({ spec: member.name, ok: false, detail: error instanceof Error ? error.message : String(error) })
      break
    }
  }
  return results
}

/**
 * Packages the starter refuses to toggle. Disabling itself would remove the very
 * tools that could re-enable it, so the guard is part of the feature.
 */
export const PROTECTED_PACKAGES = Object.freeze(['dsh-starter'])

/**
 * Split members into the ones the starter may toggle and the protected ones.
 * @param {Array<{ name: string, version?: string, reason?: string }>} members
 * @returns {{ toggleable: Array<{ name: string, version?: string, reason?: string }>, protectedMembers: Array<{ name: string, version?: string, reason?: string }> }}
 */
export function partitionMembers(members) {
  const protectedNames = new Set(PROTECTED_PACKAGES)
  return {
    toggleable: members.filter(member => !protectedNames.has(member.name)),
    protectedMembers: members.filter(member => protectedNames.has(member.name)),
  }
}

/**
 * Enable or disable template member bundles without uninstalling them. The loop
 * stops at the first failure so a partial toggle is reported honestly.
 * @param {{ setBundleEnabled: (name: string, enabled: boolean) => Promise<unknown> } | undefined} manager
 * @param {Array<{ name: string, version?: string, reason?: string }>} members
 * @param {boolean} enabled
 * @returns {Promise<Array<{ spec: string, ok: boolean, detail?: string }>>}
 */
export async function setMembersEnabled(manager, members, enabled) {
  if (manager === undefined) {
    throw new Error('starter: this profile has no plugin manager; toggle members manually in the Plugins page')
  }
  const results = []
  for (const member of members) {
    try {
      await manager.setBundleEnabled(member.name, enabled)
      results.push({ spec: member.name, ok: true })
    } catch (error) {
      results.push({ spec: member.name, ok: false, detail: error instanceof Error ? error.message : String(error) })
      break
    }
  }
  return results
}
