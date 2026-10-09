import { expect, it } from 'vitest'
import { desktopUpdatesDisabled, resolveDesktopPolicyEnvironment } from '../scripts/desktop-policy-environment.mjs'
import { validateDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { resolveDesktopPolicyConfig } from '../src/mandatory-update-policy.ts'

const origins = { DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://test.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://prod.example.com' }
const auth = { DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }) }

it('disables policy only for explicitly selected unsigned Windows self-use packages', () => {
  const environment = { DSH_DESKTOP_APP_ID: 'com.example.selfuse', DSH_DESKTOP_WINDOWS_DISABLE_UPDATES: '1' }
  expect(() => { validateDesktopPackageEnvironment(environment, { platform: 'win32', arch: 'x64' }, { unsigned: true }) }).not.toThrow()
  expect(() => { validateDesktopPackageEnvironment(environment, { platform: 'win32', arch: 'x64' }) }).toThrow('unsigned Windows')
  expect(() => { validateDesktopPackageEnvironment(environment, { platform: 'darwin', arch: 'x64' }, { unsigned: true }) }).toThrow('unsigned Windows')
})

it.each(['', 'true', '2'])('rejects an invalid self-use update setting %s', (value) => {
  expect(() => desktopUpdatesDisabled({ DSH_DESKTOP_WINDOWS_DISABLE_UPDATES: value }, true, 'win32')).toThrow('must be 0 or 1')
})

it.each([undefined, '0'])('retains policy requirements when the self-use setting is %s', (value) => {
  expect(desktopUpdatesDisabled({ DSH_DESKTOP_WINDOWS_DISABLE_UPDATES: value }, true, 'win32')).toBe(false)
})

it.each(['test', 'production'] as const)('selects the %s policy and authentication together', (deployment) => {
  const policy = resolveDesktopPolicyEnvironment({ ...origins, ...(deployment === 'test' ? auth : {}), DSH_DESKTOP_AUTO_UPDATE_ENV: deployment })
  const origin = deployment === 'test' ? origins.DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN : origins.DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN
  expect(policy).toEqual({ origin, allowedPageOrigins: [origin],
    ...(deployment === 'test' ? { allowedAuthOrigins: ['https://login.example.com'] } : {}),
    authentication: deployment === 'test' ? 'feishu-test' : 'anonymous' })
  expect(resolveDesktopPolicyConfig(policy)).toMatchObject(policy)
})

it('requires only the selected origin, defaults to test, and accepts explicit page restrictions', () => {
  const policy = resolveDesktopPolicyEnvironment({
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: origins.DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN,
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'],
      allowedPageOrigins: ['https://download.example.com'], intervalMs: 5000 }) })
  expect(policy).toMatchObject({ authentication: 'feishu-test', intervalMs: 5000, allowedPageOrigins: ['https://download.example.com'] })
  expect(() => resolveDesktopPolicyEnvironment({ ...origins, DSH_DESKTOP_AUTO_UPDATE_ENV: 'prod' })).toThrow('production')
})

it.each([undefined, '', 'http://test.example.com', 'https://user:secret@test.example.com',
  'https://test.example.com/api', 'https://test.example.com/?secret=value'])('rejects invalid selected origin %s', (origin) => {
  expect(() => resolveDesktopPolicyEnvironment({ ...auth, DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: origin })).toThrow('HTTPS origin')
  expect(() => resolveDesktopPolicyEnvironment({ ...auth, DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: origin })).not.toThrow('secret=value')
})

it.each(['{', 'null', '[]', '{"origin":"https://old.example.com"}', '{"authentication":"anonymous"}',
  '{"allowedPageOrigins":[]}', '{"allowedPageOrigins":["http://example.com"]}'])('rejects invalid or conflicting shared options %s', (options) => {
  expect(() => resolveDesktopPolicyEnvironment({ ...origins, DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: options })).toThrow()
})

it.each([undefined, '[]', '["http://login.example.com"]', '["https://login.example.com/path"]',
  '["https://user:secret@login.example.com"]'])('rejects missing or invalid test login origins %s', (value) => {
  const settings = value === undefined ? {} : { allowedAuthOrigins: JSON.parse(value) as unknown }
  expect(() => resolveDesktopPolicyEnvironment({ ...origins, DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify(settings) })).toThrow()
})

it('rejects login origins in production', () => {
  expect(() => resolveDesktopPolicyEnvironment({ ...origins, ...auth, DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' }))
    .toThrow('must not configure allowedAuthOrigins')
})

it.each([{ unsigned: true }, { prepareOnly: true }, {}])('fails before signing/preparation when policy is absent in %j', (options) => {
  for (const platform of ['win32', 'darwin'] as const) {
    expect(() => { validateDesktopPackageEnvironment({ DSH_DESKTOP_APP_ID: 'com.example.test' }, { platform, arch: 'x64' }, options) })
      .toThrow('DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN')
  }
})
