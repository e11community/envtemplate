import * as core from '@actions/core'
import { parse as parseDotenv } from 'dotenv'
import { readFile } from 'fs/promises'
import { renderTemplate } from './core.js'

async function run(): Promise<void> {
  try {
    const templates = core.getMultilineInput('templates', { required: true })
    const output = core.getInput('output', { required: true })
    const outputModeInput = core.getInput('output-mode')
    const envFile = core.getInput('env-file')
    const envLines = core.getMultilineInput('env')

    let outputMode: number | undefined
    if (outputModeInput) {
      if (!/^[0-7]+$/.test(outputModeInput)) {
        throw new Error(
          `Invalid output-mode value: ${outputModeInput} (expected chmod-style octal, e.g. 600)`,
        )
      }
      outputMode = parseInt(outputModeInput, 8)
    }

    let env: Record<string, string> | undefined
    if (envFile || envLines.length > 0) {
      const fromFile = envFile ? parseDotenv(await readFile(envFile, 'utf8')) : {}
      const fromInput = envLines.length > 0 ? parseDotenv(envLines.join('\n')) : {}
      env = { ...fromFile, ...fromInput }
    }

    await renderTemplate({
      templatePath: templates,
      outputPath: output,
      outputMode,
      onMissing: 'empty',
      env,
    })
  } catch (err) {
    core.setFailed((err as Error).message)
  }
}

run()
