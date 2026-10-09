import { expect, it, vi } from 'vitest'

vi.mock('../scripts/macos-notarization-proxy.ts', () => {
  throw new Error('macOS proxy requires unavailable POSIX build artifacts')
})

it('loads the Windows packaging entry without initializing the macOS proxy', async () => {
  const { parseDesktopPackageInvocation } = await import('../scripts/package-target.ts')
  expect(parseDesktopPackageInvocation(['win-x64', '--unsigned', '--check'], 'win32', 'x64'))
    .toMatchObject({ unsigned: true, check: true, target: { platform: 'win32' } })
})
