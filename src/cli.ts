import { generateNpmrc } from './core.js';
import type { OnMissing } from './envsubst.js';

const USAGE = `Usage: npm-auth [options]

Render a template to an .npmrc file, substituting \${VAR} references from
the environment.

Options:
  --template <path>      Path to template file (default: .npmrc.tmpl)
  --output <path>        Path to output file (default: .npmrc)
  --on-missing <mode>    Behavior on missing var: error | empty | keep
                         (default: empty)
  -h, --help             Show this help and exit
`;

interface ParsedArgs {
  template: string;
  output: string;
  onMissing: OnMissing;
  help: boolean;
}

function isOnMissing(value: string): value is OnMissing {
  return value === 'error' || value === 'empty' || value === 'keep';
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let template = '.npmrc.tmpl';
  let output = '.npmrc';
  let onMissing: OnMissing = 'empty';
  let help = false;

  const takeValue = (flag: string, inline: string | undefined, i: number): [string, number] => {
    if (inline !== undefined) return [inline, i];
    const next = argv[i + 1];
    if (next === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);

    switch (name) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '--template': {
        const [value, next] = takeValue(name, inline, i);
        template = value;
        i = next;
        break;
      }
      case '--output': {
        const [value, next] = takeValue(name, inline, i);
        output = value;
        i = next;
        break;
      }
      case '--on-missing': {
        const [value, next] = takeValue(name, inline, i);
        if (!isOnMissing(value)) {
          throw new Error(`Invalid --on-missing value: ${value} (expected: error, empty, keep)`);
        }
        onMissing = value;
        i = next;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { template, output, onMissing, help };
}

async function main(): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    await generateNpmrc({
      templatePath: parsed.template,
      outputPath: parsed.output,
      onMissing: parsed.onMissing,
    });
    return 0;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
}

main().then((code) => {
  process.exit(code);
});
