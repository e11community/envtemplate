import * as core from '@actions/core'
import { parse as parseDotenv } from 'dotenv'
import { readFile } from 'fs/promises'
import { generateNpmrc } from './core.js'

async function run(): Promise<void> {
  try {
    const templates = core.getMultilineInput('templates')
    const output = core.getInput('output') || '.npmrc'
    const envFile = core.getInput('env-file')
    const envLines = core.getMultilineInput('env')

    let env: Record<string, string> | undefined
    if (envFile || envLines.length > 0) {
      const fromFile = envFile ? parseDotenv(await readFile(envFile, 'utf8')) : {}
      const fromInput = envLines.length > 0 ? parseDotenv(envLines.join('\n')) : {}
      env = { ...fromFile, ...fromInput }
    }

    await generateNpmrc({
      templatePath: templates.length > 0 ? templates : '.npmrc.tmpl',
      outputPath: output,
      onMissing: 'empty',
      env,
    })
  } catch (err) {
    core.setFailed((err as Error).message)
  }
}

run()
