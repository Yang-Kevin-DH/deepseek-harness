import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const require = createRequire(import.meta.url)

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-dev-launcher-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop development launcher', () => {
  it('runs repository builds before loading built-package desktop helpers', () => {
    const root = temporaryRoot()
    const app = join(root, 'apps', 'desktop')
    mkdirSync(join(app, 'scripts'), { recursive: true })
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"type":"module"}\n')
    copyFileSync(new URL('../scripts/dev.ts', import.meta.url), join(app, 'scripts', 'dev.ts'))
    writeFileSync(join(app, 'src', 'host-protocol.ts'), 'export const DESKTOP_HOST_PROTOCOL_VERSION = 1\n')
    writeFileSync(join(app, 'scripts', 'development-project.ts'), [
      "import '@deepseek-ai/dsh-app-boot'",
      'export function prepareDevelopmentProject(): string { return "" }',
      '',
    ].join('\n'))
    writeFileSync(join(app, 'scripts', 'prepare-primary-runtime.ts'), 'export async function preparePrimaryRuntime(): Promise<void> {}\n')
    writeFileSync(join(app, 'scripts', 'development-app.ts'), 'export function prepareDevelopmentApp(): string { return "" }\n')

    const log = join(root, 'fake-pnpm.log')
    const fakePnpm = join(root, 'fake-pnpm.mjs')
    writeFileSync(fakePnpm, [
      "import { appendFileSync } from 'node:fs'",
      "appendFileSync(process.env.FAKE_PNPM_LOG, `${process.cwd()} ${process.argv.slice(2).join(' ')}\\n`)",
      '',
    ].join('\n'))

    const result = spawnSync(process.execPath, [
      '--import',
      pathToFileURL(require.resolve('tsx/esm')).href,
      join(app, 'scripts', 'dev.ts'),
    ], {
      cwd: app,
      env: { ...process.env, npm_execpath: fakePnpm, FAKE_PNPM_LOG: log },
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(readFileSync(log, 'utf8').replaceAll('\\', '/')).toBe([
      `${root.replaceAll('\\', '/')} run build`,
      `${app.replaceAll('\\', '/')} run build`,
      '',
    ].join('\n'))
    expect(`${result.stdout}\n${result.stderr}`).toContain('desktop development: missing built artifact')
  })
})
