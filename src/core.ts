import { access, readFile, writeFile } from 'fs/promises'
import { envsubst, type OnMissing } from './envsubst.js'

export interface GenerateNpmrcOptions {
  templatePath: string | string[]
  outputPath: string
  onMissing?: OnMissing
  env?: Record<string, string | undefined>
}

export async function generateNpmrc(opts: GenerateNpmrcOptions): Promise<void> {
  const candidates = Array.isArray(opts.templatePath)
    ? opts.templatePath
    : [opts.templatePath]
  const tried = [...candidates]

  while (candidates.length > 0) {
    const candidate = candidates.pop()!
    try {
      await access(candidate)
    } catch {
      continue
    }
    const template = await readFile(candidate, { encoding: 'utf8' })
    const rendered = envsubst(template, { env: opts.env, onMissing: opts.onMissing })
    await writeFile(opts.outputPath, rendered, { mode: 0o600 })
    return
  }

  throw new Error(`No template file found. Tried: ${tried.join(', ')}`)
}
