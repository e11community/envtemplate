import { access, readFile, writeFile } from 'fs/promises'
import { envsubst, type OnMissing } from './envsubst.js'

export const DEFAULT_OUTPUT_MODE = 0o600

export interface RenderTemplateOptions {
  templatePath: string | string[]
  outputPath: string
  outputMode?: number
  onMissing?: OnMissing
  env?: Record<string, string | undefined>
}

export async function renderTemplate(opts: RenderTemplateOptions): Promise<void> {
  const candidates = Array.isArray(opts.templatePath)
    ? opts.templatePath
    : [opts.templatePath]
  const tried = [...candidates]
  const mode = opts.outputMode ?? DEFAULT_OUTPUT_MODE

  while (candidates.length > 0) {
    const candidate = candidates.pop()!
    try {
      await access(candidate)
    } catch {
      continue
    }
    const template = await readFile(candidate, { encoding: 'utf8' })
    const rendered = envsubst(template, { env: opts.env, onMissing: opts.onMissing })
    await writeFile(opts.outputPath, rendered, { mode })
    return
  }

  throw new Error(`No template file found. Tried: ${tried.join(', ')}`)
}
