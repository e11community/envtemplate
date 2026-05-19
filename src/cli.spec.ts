import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const CLI_PATH = resolve(__dirname, '..', 'dist', 'cli.js')

interface CliRun {
  stdout: string
  stderr: string
  code: number
}

function runCli(
  args: readonly string[],
  opts: { stdin?: string; env?: Record<string, string> } = {},
): Promise<CliRun> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, ...opts.env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8')
    })
    child.on('error', rejectP)
    child.on('close', (code) => {
      resolveP({ stdout, stderr, code: code ?? -1 })
    })
    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin)
    }
    child.stdin.end()
  })
}

describe('cli stdin/stdout', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'npmrc-auth-cli-spec-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads template from stdin and writes rendered output to stdout', async () => {
    const result = await runCli(['--template', '-', '--output', '-'], {
      stdin: 'token=${BAR}',
      env: { BAR: 'baz' },
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('token=baz')
    expect(result.stderr).toBe('')
  })

  it('reads template from stdin and writes to a file with mode 0o600', async () => {
    const out = join(dir, '.npmrc')

    const result = await runCli(['--template', '-', '--output', out], {
      stdin: 'token=${BAR}',
      env: { BAR: 'baz' },
    })

    expect(result.code).toBe(0)
    expect(await readFile(out, 'utf8')).toBe('token=baz')
    const st = await stat(out)
    expect(st.mode & 0o777).toBe(0o600)
  })

  it('reads template from a file and writes rendered output to stdout', async () => {
    const tmpl = join(dir, '.npmrc.tmpl')
    await writeFile(tmpl, 'token=${BAR}')

    const result = await runCli(['--template', tmpl, '--output', '-'], {
      env: { BAR: 'baz' },
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('token=baz')
  })

  it('prefers stdin when it is the rightmost candidate (overrides earlier file)', async () => {
    const tmpl = join(dir, '.npmrc.tmpl')
    await writeFile(tmpl, 'from=file')

    const result = await runCli(
      ['--template', tmpl, '--template', '-', '--output', '-'],
      { stdin: 'from=stdin' },
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('from=stdin')
  })

  it('falls back to stdin when a later file candidate is missing', async () => {
    const missing = join(dir, 'does-not-exist.tmpl')

    const result = await runCli(
      ['--template', '-', '--template', missing, '--output', '-'],
      { stdin: 'from=stdin' },
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('from=stdin')
  })
})
