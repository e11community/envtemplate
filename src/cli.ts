import { parse as parseDotenv } from 'dotenv'
import { access, readFile, writeFile } from 'fs/promises'
import { DEFAULT_OUTPUT_MODE, renderTemplate } from './core.js'
import { envsubst, type OnMissing } from './envsubst.js'

const USAGE = `Usage: envtemplate --template <path> --output <path> [options]

Render a template, substituting \${VAR} references from the environment.

Required:
  --template <path>      Path to a template file. May be passed multiple
                         times; the rightmost existing file is used,
                         falling back leftward. Use "-" for stdin.
  --output <path>        Path to the output file. Use "-" for stdout.

Options:
  --env <path>           Path to a .env-style file. When set, substitution
                         variables come from this file (parsed by dotenv)
                         instead of process.env.
  --output-mode <octal>  File mode for the output file (chmod-style octal,
                         e.g. 600, 644). Ignored when --output is "-".
                         (default: 600)
  --on-missing <mode>    Behavior on missing var: error | empty | keep
                         (default: empty)
  -h, --help             Show this help and exit
`

interface ParsedArgs {
  templates: string[]
  output: string
  outputMode?: number
  envFile?: string
  onMissing: OnMissing
  help: boolean
}

function isOnMissing(value: string): value is OnMissing {
  return value === 'error' || value === 'empty' || value === 'keep'
}

function parseOctalMode(value: string): number {
  if (!/^[0-7]+$/.test(value)) {
    throw new Error(
      `Invalid --output-mode value: ${value} (expected chmod-style octal, e.g. 600)`,
    )
  }
  return parseInt(value, 8)
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const templates: string[] = []
  let output: string | undefined
  let outputMode: number | undefined
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
      case '--output-mode': {
        const [value, next] = takeValue(name, inline, i)
        outputMode = parseOctalMode(value)
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

  if (help) {
    return { templates, output: '', outputMode, envFile, onMissing, help }
  }

  if (templates.length === 0) {
    throw new Error('Missing required argument: --template')
  }
  if (output === undefined) {
    throw new Error('Missing required argument: --output')
  }

  return { templates, output, outputMode, envFile, onMissing, help }
}

async function readStdin(): Promise<string> {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    data += chunk
  }
  return data
}

async function resolveTemplate(candidates: readonly string[]): Promise<string> {
  const remaining = [...candidates]
  while (remaining.length > 0) {
    const candidate = remaining.pop()!
    if (candidate === '-') {
      return readStdin()
    }
    try {
      await access(candidate)
    } catch {
      continue
    }
    return readFile(candidate, 'utf8')
  }
  throw new Error(`No template file found. Tried: ${candidates.join(', ')}`)
}

async function writeOutput(path: string, content: string, mode: number): Promise<void> {
  if (path === '-') {
    process.stdout.write(content)
    return
  }
  await writeFile(path, content, { mode })
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

    const usesStdin = parsed.templates.includes('-')
    const usesStdout = parsed.output === '-'

    if (!usesStdin && !usesStdout) {
      await renderTemplate({
        templatePath: parsed.templates,
        outputPath: parsed.output,
        outputMode: parsed.outputMode,
        onMissing: parsed.onMissing,
        env,
      })
    } else {
      const template = await resolveTemplate(parsed.templates)
      const rendered = envsubst(template, { env, onMissing: parsed.onMissing })
      await writeOutput(parsed.output, rendered, parsed.outputMode ?? DEFAULT_OUTPUT_MODE)
    }
    return 0
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }
}

main().then((code) => {
  process.exit(code)
})
