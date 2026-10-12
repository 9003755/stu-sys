// Verify portable local Markdown links. Does not request external URLs.
import { readdir, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? collect(full) : entry.name.endsWith('.md') ? [full] : []
  }))
  return files.flat()
}
const files = [
  ...['README.md', 'AGENTS.md', 'STATUS.md', 'PROJECT_SUMMARY.md'].map(name => path.join(root, name)),
  ...await collect(path.join(root, 'docs')),
]
const failures = []
let linkCount = 0
for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (/file:\/\/\//i.test(source)) failures.push(`${path.relative(root, file)}: machine-specific file URL`)
  // These docs use inline links without literal parentheses in paths.
  const withoutCode = source.replace(/```[^\n]*\n[\s\S]*?```/g, '')
  for (const match of withoutCode.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split(/[?#]/)[0]
    if (!target || /^(https?:|mailto:)/i.test(target)) continue
    linkCount++
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target))
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      failures.push(`${path.relative(root, file)}: nonportable link ${target}`)
      continue
    }
    try { await access(resolved) } catch { failures.push(`${path.relative(root, file)}: missing ${target}`) }
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`PASS: ${files.length} documents, ${linkCount} local links; no machine-specific file URLs`)
}
