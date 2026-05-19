import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateNpmrc } from './core'

describe('generateNpmrc', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'npmrc-auth-spec-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const paths = () => ({
    templatePath: join(dir, '.npmrc.tmpl'),
    outputPath: join(dir, '.npmrc'),
  })

  it('reads the template, substitutes env, and writes rendered content to outputPath', async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, '//npm.pkg.github.com/:_authToken=${TOKEN}\n')

    await generateNpmrc({ templatePath, outputPath, env: { TOKEN: 'abc123' } })

    expect(await readFile(outputPath, 'utf8')).toBe(
      '//npm.pkg.github.com/:_authToken=abc123\n',
    )
  })

  it('creates the output file with mode 0o600', async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'x')

    await generateNpmrc({ templatePath, outputPath, env: {} })

    const st = await stat(outputPath)
    expect(st.mode & 0o777).toBe(0o600)
  })

  it("propagates onMissing: 'error' as a rejection when a var is missing", async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'value=${MISSING_KEY}')

    await expect(
      generateNpmrc({ templatePath, outputPath, onMissing: 'error', env: {} }),
    ).rejects.toThrow(/MISSING_KEY/)
  })

  it("defaults to 'empty' behavior when onMissing is omitted", async () => {
    const { templatePath, outputPath } = paths()
    await writeFile(templatePath, 'value=[${MISSING}]')

    await generateNpmrc({ templatePath, outputPath, env: {} })

    expect(await readFile(outputPath, 'utf8')).toBe('value=[]')
  })

  it('passes the supplied env through to envsubst (overrides process.env)', async () => {
    const KEY = '__CORE_SPEC_OVERRIDE__'
    process.env[KEY] = 'from-process'
    try {
      const { templatePath, outputPath } = paths()
      await writeFile(templatePath, `v=\${${KEY}}`)

      await generateNpmrc({ templatePath, outputPath, env: { [KEY]: 'from-arg' } })

      expect(await readFile(outputPath, 'utf8')).toBe('v=from-arg')
    } finally {
      delete process.env[KEY]
    }
  })
})
