import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
// GitHub Pages uses the repository name, which differs from the npm package name.
const githubPagesBase = '/sites.magical-game-night-gatherings/'

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === 'string')
)

const child = spawn(command, ['run', 'build'], {
  cwd: root,
  env: {
    ...env,
    VITEPRESS_BASE: githubPagesBase
  },
  shell: true,
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
