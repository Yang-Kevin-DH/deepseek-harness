import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

it.each(['@deepseek-ai/dsh-home-paths', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-deepseek-account'])(
  'ships the main-process runtime dependency %s', (name) => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies[name]).toBe('workspace:^')
  },
)

it('declares the required workspace peer closure at the application root', () => {
  const file = new URL('../package.json', import.meta.url)
  const application = JSON.parse(readFileSync(file, 'utf8')) as { dependencies: Record<string, string> }
  const visited = new Set<string>()
  const inspect = (file: string | URL): void => {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    if (visited.has(manifest.name)) return
    visited.add(manifest.name)
    const require = createRequire(file)
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (!name.startsWith('@deepseek-ai/')) continue
      if (manifest.peerDependencies?.[name] && !manifest.peerDependenciesMeta?.[name]?.optional) {
        expect(application.dependencies, `${manifest.name} requires ${name}`).toHaveProperty(name)
      }
      inspect(require.resolve(`${name}/package.json`))
    }
  }
  inspect(file)
})
