import { parse as parseDotenv } from 'dotenv'
import { access, readFile, writeFile } from 'fs/promises'
import { generateNpmrc } from './core.js'
import { envsubst, type OnMissing } from './envsubst.js'

const USAGE = `Usage: npm-auth [options]

Render a template to an .npmrc file, substituting \${VAR} references from
the environment.

Options:
  --template <path>      Path to template file. May be passed multiple
                         times; the rightmost existing file is used,
                         falling back leftward. Use "-" for stdin.
                         (default: .npmrc.tmpl)
  --output <path>        Path to output file. Use "-" for stdout.
                         (default: .npmrc)
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

async function writeOutput(path: string, content: string): Promise<void> {
  if (path === '-') {
    process.stdout.write(content)
    return
  }
  await writeFile(path, content, { mode: 0o600 })
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
      await generateNpmrc({
        templatePath: parsed.templates,
        outputPath: parsed.output,
        onMissing: parsed.onMissing,
        env,
      })
    } else {
      const template = await resolveTemplate(parsed.templates)
      const rendered = envsubst(template, { env, onMissing: parsed.onMissing })
      await writeOutput(parsed.output, rendered)
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
