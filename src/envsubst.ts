export type OnMissing = 'error' | 'empty' | 'keep';

export interface EnvsubstOptions {
  env?: Record<string, string | undefined>;
  onMissing?: OnMissing;
}

const VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function envsubst(input: string, options: EnvsubstOptions = {}): string {
  const env = options.env ?? process.env;
  const onMissing: OnMissing = options.onMissing ?? 'empty';

  return input.replace(VAR_PATTERN, (match, name: string) => {
    const value = env[name];
    if (value !== undefined) {
      return value;
    }
    if (onMissing === 'error') {
      throw new Error(`envsubst: missing environment variable: ${name}`);
    }
    if (onMissing === 'keep') {
      return match;
    }
    return '';
  });
}
