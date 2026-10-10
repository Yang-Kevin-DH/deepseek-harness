import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it.each(['@deepseek-ai/dsh-home-paths', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-deepseek-account'])(
  'ships the main-process runtime dependency %s', (name) => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies[name]).toBe('workspace:^')
  },
)
