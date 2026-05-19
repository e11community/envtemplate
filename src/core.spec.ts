import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { renderTemplate } from './core'

describe('renderTemplate', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'envtemplate-spec-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const paths = () => ({
    templatePath: join(dir, 'template.tmpl'),
    outputPath: join(dir, 'output'),
  })

  it('reads the template, substitutes env, and writes rendered content to outputPath', async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'token=${TOKEN}\n')

    await renderTemplate({ templatePath, outputPath, env: { TOKEN: 'abc123' } })

    expect(await readFile(outputPath, 'utf8')).toBe('token=abc123\n')
  })

  it('creates the output file with mode 0o600 by default', async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'x')

    await renderTemplate({ templatePath, outputPath, env: {} })

    const st = await stat(outputPath)
    expect(st.mode & 0o777).toBe(0o600)
  })

  it('respects a custom outputMode', async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'x')

    await renderTemplate({ templatePath, outputPath, outputMode: 0o644, env: {} })

    const st = await stat(outputPath)
    expect(st.mode & 0o777).toBe(0o644)
  })

  it("propagates onMissing: 'error' as a rejection when a var is missing", async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'value=${MISSING_KEY}')

    await expect(
      renderTemplate({ templatePath, outputPath, onMissing: 'error', env: {} }),
    ).rejects.toThrow(/MISSING_KEY/)
  })

  it("defaults to 'empty' behavior when onMissing is omitted", async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'value=[${MISSING}]')

    await renderTemplate({ templatePath, outputPath, env: {} })

    expect(await readFile(outputPath, 'utf8')).toBe('value=[]')
  })

  it('passes the supplied env through to envsubst (overrides process.env)', async () => {
    const KEY = '__CORE_SPEC_OVERRIDE__'
    process.env[KEY] = 'from-process'
    try {
      const { templatePath, outputPath } = paths()
      await writeFile(templatePath, `v=\${${KEY}}`)

      await renderTemplate({ templatePath, outputPath, env: { [KEY]: 'from-arg' } })

      expect(await readFile(outputPath, 'utf8')).toBe('v=from-arg')
    } finally {
      delete process.env[KEY]
    }
  })

  describe('templatePath fallback', () => {
    it('falls back leftward when the rightmost candidate does not exist', async () => {
      const { outputPath } = paths()
      const fallback = join(dir, 'fallback.tmpl')
      const missing = join(dir, 'does-not-exist.tmpl')
      await writeFile(fallback, 'used=fallback')

      await renderTemplate({ templatePath: [fallback, missing], outputPath, env: {} })

      expect(await readFile(outputPath, 'utf8')).toBe('used=fallback')
    })

    it('prefers the rightmost existing candidate and does not read earlier ones', async () => {
      const { outputPath } = paths()
      const first = join(dir, 'first.tmpl')
      const last = join(dir, 'last.tmpl')
      await writeFile(first, 'used=first')
      await writeFile(last, 'used=last')

      await renderTemplate({ templatePath: [first, last], outputPath, env: {} })

      expect(await readFile(outputPath, 'utf8')).toBe('used=last')
    })

    it('throws when all candidates are missing, listing each path in the message', async () => {
      const { outputPath } = paths()
      const a = join(dir, 'missing-a.tmpl')
      const b = join(dir, 'missing-b.tmpl')

      await expect(
        renderTemplate({ templatePath: [a, b], outputPath, env: {} }),
      ).rejects.toThrow(new RegExp(`No template file found.*${a}.*${b}`))
    })
  })
})
