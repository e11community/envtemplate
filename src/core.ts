import { readFile, writeFile } from 'fs/promises'
import { envsubst, type OnMissing } from './envsubst.js'

export interface GenerateNpmrcOptions {
  templatePath: string
  outputPath: string
  onMissing?: OnMissing
  env?: Record<string, string | undefined>
}

export async function generateNpmrc(opts: GenerateNpmrcOptions): Promise<void> {
  const template = await readFile(opts.templatePath, { encoding: 'utf8' })
  const rendered = envsubst(template, { env: opts.env, onMissing: opts.onMissing })
  await writeFile(opts.outputPath, rendered, { mode: 0o600 })
}
