import * as core from '@actions/core'
import { generateNpmrc } from './core.js'

async function run(): Promise<void> {
  try {
    const template = core.getInput('template') || '.npmrc.tmpl'
    const output = core.getInput('output') || '.npmrc'
    const token = core.getInput('token', { required: true })

    core.setSecret(token)
    process.env.GHPR_TOKEN = token

    await generateNpmrc({
      templatePath: template,
      outputPath: output,
      onMissing: 'empty',
    })
  } catch (err) {
    core.setFailed((err as Error).message)
  }
}

run()
