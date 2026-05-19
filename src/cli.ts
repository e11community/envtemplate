import { parse as parseDotenv } from 'dotenv'
import { readFile } from 'fs/promises'
import { generateNpmrc } from './core.js'
import type { OnMissing } from './envsubst.js'

const USAGE = `Usage: npm-auth [options]

Render a template to an .npmrc file, substituting \${VAR} references from
the environment.

Options:
  --template <path>      Path to template file. May be passed multiple
                         times; the rightmost existing file is used,
                         falling back leftward. (default: .npmrc.tmpl)
  --output <path>        Path to output file (default: .npmrc)
  --env <path>           Path to a .env-style file. When set, substitution
                         variables come from this file (parsed by dotenv)
                         instead of process.env.
  --on-missing <mode>    Behavior on missing var: error | empty | keep
                         (default: empty)
  -h, --help             Show this help and exit
`

interface ParsedArgs {
  templates: string[]
  output: string
  envFile?: string
  onMissing: OnMissing
  help: boolean
}

function isOnMissing(value: string): value is OnMissing {
  return value === 'error' || value === 'empty' || value === 'keep'
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const templates: string[] = []
  let output = '.npmrc'
  let envFile: string | undefined
  let onMissing: OnMissing = 'empty'
  let help = false

  const takeValue = (flag: string, inline: string | undefined, i: number): [string, number] => {
    if (inline !== undefined) return [inline, i]
    const next = argv[i + 1]
    if (next === undefined) {
      throw new Error(`Missing value for ${flag}`)
    }
    return [next, i + 1]
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)

    switch (name) {
      case '-h':
      case '--help':
        help = true
        break
      case '--template': {
        const [value, next] = takeValue(name, inline, i)
        templates.push(value)
        i = next
        break
      }
      case '--output': {
        const [value, next] = takeValue(name, inline, i)
        output = value
        i = next
        break
      }
      case '--env': {
        const [value, next] = takeValue(name, inline, i)
        envFile = value
        i = next
        break
      }
      case '--on-missing': {
        const [value, next] = takeValue(name, inline, i)
        if (!isOnMissing(value)) {
          throw new Error(`Invalid --on-missing value: ${value} (expected: error, empty, keep)`)
        }
        onMissing = value
        i = next
        break
      }
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (templates.length === 0) {
    templates.push('.npmrc.tmpl')
  }

  return { templates, output, envFile, onMissing, help }
}

async function main(): Promise<number> {
  let parsed: ParsedArgs
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`)
    return 2
  }

  if (parsed.help) {
    process.stdout.write(USAGE)
    return 0
  }

  try {
    let env: Record<string, string> | undefined
    if (parsed.envFile !== undefined) {
      const contents = await readFile(parsed.envFile, 'utf8')
      env = parseDotenv(contents)
    }

    await generateNpmrc({
      templatePath: parsed.templates,
      outputPath: parsed.output,
      onMissing: parsed.onMissing,
      env,
    })
    return 0
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }
}

main().then((code) => {
  process.exit(code)
})
