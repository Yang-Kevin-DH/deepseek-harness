/** Resolve the packaged shell's static imports from its ASAR application root. */
import { readFileSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import ts from 'typescript'
import { app } from 'electron'
import { pathToFileURL } from 'node:url'

const entry = process.argv[2]
const require = createRequire(entry)
const program = ts.createSourceFile(entry, readFileSync(entry, 'utf8'), ts.ScriptTarget.Latest, true)
for (const statement of program.statements) {
  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
  const specifier = statement.moduleSpecifier
  if (specifier === undefined || !ts.isStringLiteral(specifier)) continue
  if (specifier.text === 'electron' || isBuiltin(specifier.text)) continue
  require.resolve(specifier.text)
}
app.requestSingleInstanceLock = () => false
app.quit = () => {}
try {
  await import(pathToFileURL(entry).href)
} catch (error) {
  console.error(error)
  app.exit(1)
}
console.log('desktop shell: packaged main-process dependency graph loaded')
app.exit(0)
