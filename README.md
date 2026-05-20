# envtemplate

Render a file from a template, substituting `${VAR}` references with values
from the environment (or a `.env`-style file). Ships as both a CLI binary
and a GitHub Action.

Common uses: producing `.npmrc`, `pip.conf`, `.env`, or any other config
file that needs to embed secrets at deploy time without committing them.

## Install

```bash
npm install -g @e11community/envtemplate
```

After install, the `envtemplate` command is on your `PATH`.

## CLI

```
envtemplate --template <path> --output <path> [options]
```

| Flag                  | Required | Description                                                                                                                                   |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--template <path>`   | Yes      | Template path. Repeatable; rightmost-existing wins, falling back leftward. Pass `-` to read from stdin.                                       |
| `--output <path>`     | Yes      | Output path. Pass `-` to write to stdout.                                                                                                     |
| `--env <path>`        | No       | Path to a `.env`-style file (parsed by [`dotenv`](https://www.npmjs.com/package/dotenv)). When set, replaces `process.env` as the var source. |
| `--output-mode <oct>` | No       | File mode for the output file, chmod-style octal (e.g. `600`, `644`). Ignored when `--output` is `-`. Default: `600`.                         |
| `--on-missing <mode>` | No       | Behavior when a `${VAR}` has no value: `error`, `empty`, or `keep`. Default: `empty`.                                                         |
| `-h`, `--help`        | No       | Show help and exit.                                                                                                                           |

### Substitution rules

- Only `${NAME}` is substituted. Bare `$VAR` and other shell-style forms are
  left untouched.
- Variable names match `[A-Za-z_][A-Za-z0-9_]*`. Invalid names (leading
  digit, dashes) are not substituted.
- An empty-string env value (`FOO=`) counts as **present** — it substitutes
  to the empty string and does not trip `--on-missing error`.

### Examples

Render a file with substitution from your shell environment:

```bash
TOKEN=abc envtemplate --template app.tmpl --output app.conf
```

Use stdin and stdout as a pipe:

```bash
echo 'auth=${TOKEN}' | TOKEN=abc envtemplate --template - --output -
# → auth=abc
```

Source vars from a `.env` file instead of the shell:

```bash
envtemplate --template app.tmpl --output app.conf --env ./secrets.env
```

Multiple templates with fallback — useful in monorepos where a service may
override a workspace-wide template:

```bash
envtemplate \
  --template workspace.tmpl \
  --template services/foo/override.tmpl \
  --output services/foo/.npmrc
```

If `services/foo/override.tmpl` exists, it is used; otherwise the workspace
template is used. If neither exists, the command exits with an error and
lists what it tried.

Use a non-default file mode:

```bash
envtemplate --template app.tmpl --output app.conf --output-mode 644
```

Treat missing variables as fatal:

```bash
envtemplate --template app.tmpl --output app.conf --on-missing error
```

## GitHub Action

```yaml
- uses: e11community/envtemplate@v1
  with:
    templates: |
      path/to/template.tmpl
    output: path/to/output
    env: |
      TOKEN=${{ secrets.MY_TOKEN }}
```

| Input         | Required | Description                                                                                                       |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `templates`   | Yes      | Newline-separated list of template candidate paths. Rightmost existing wins, falling back leftward.               |
| `output`      | Yes      | Path to the output file.                                                                                          |
| `output-mode` | No       | File mode for the output file, chmod-style octal (e.g. `"600"`, `"644"`). Default: `"600"`.                       |
| `env`         | No       | Dotenv-format `KEY=VALUE` lines used as the substitution env. Overrides keys provided by `env-file` on collision. |
| `env-file`    | No       | Path to a `.env`-style file (parsed by dotenv). Combined with `env` (env wins on key collisions).                 |

`env` and `env-file` are merged, with `env` keys taking precedence. If
neither is provided, the action falls back to the workflow's process
environment.

### Worked example

A more complete usage — including a matrix over microservices, fallback
between a workspace-wide template and per-service overrides — lives at
[`impl/.github/workflows/action.yml`](impl/.github/workflows/action.yml).
That file is not picked up by GitHub Actions (it's outside the repo's
top-level `.github/workflows/`); it's there purely as a documented
reference.

## Why a 0o600 default?

The original motivation for this tool was rendering files like `.npmrc`
and `.env` that contain bearer tokens. Defaulting to `0o600` (owner
read/write only) means a misconfigured CI job won't leave a world-readable
secret on disk. Override with `--output-mode` / `output-mode:` when you
need something more permissive.

