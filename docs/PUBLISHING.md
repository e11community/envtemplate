# Publishing

`@e11community/envtemplate` is unusual: it's **both** a GitHub Action (consumed
by git ref, `e11community/envtemplate@v1`) **and** a published npm package
(consumed via `npm i -g` / `npx envtemplate`). The two distribution channels
have different mechanics. Both are now automated in `release.yml`; this doc
records how, and the one-time npmjs.com setup it depends on.

## Current state

- **Action channel** — fully automated. `release.yml` bumps the version,
  regenerates `CHANGELOG.md`, tags `vX.Y.Z`, force-moves the `vMAJOR` pointer,
  and cuts a GitHub Release on every releasable merge to `main`. Consumers
  pinning `@v1` track it automatically.
- **npm channel** — **automated.** The same `release` job runs `npm publish` to
  the public `registry.npmjs.org` via OIDC trusted publishing (see below), so a
  release ships the action _and_ the npm package as one atomic run. **Depends on
  the one-time npmjs.com trusted-publisher setup** — until that exists, the
  publish step fails (the rest of the release still succeeds).
- **Testing** — `validate.yml`'s `check` job runs `npm test` on every PR and
  push to `main`, and the `release` job re-runs `npm run build && npm test`
  before tagging, so a broken build never publishes.

## Why publish is folded into `release.yml` (not a separate workflow)

Publishing lives in the existing `release` job — **not** a separate `publish.yml`.

### Why a separate publish workflow would silently never run

The obvious design — a `publish.yml` triggered `on: release: [published]` or on
the `v*` tag — **will not fire**. `release.yml` creates the tag and the GitHub
Release using the built-in `GITHUB_TOKEN`, and GitHub deliberately does **not**
let events produced by `GITHUB_TOKEN` cascade into triggering other workflows
(a loop-prevention guard). A tag/release-triggered publisher would wait for an
event that never arrives. This is the same reason the skill folds the `vMAJOR`
tag move _inside_ `release.yml` rather than a standalone tag-triggered mover.

So the publish step belongs in the `release` job itself.

### Ordering: build + test _before_ any tag/commit

Sequence the job so a failure aborts **before** side effects:

1. `npm ci`
2. Decide whether to release (existing step)
3. **Build + test** (gated on the release decision)
4. Version bump → `CHANGELOG.md` → commit → tag → push → `gh release create`
5. **`npm publish`**

Building and testing before step 4 means a broken build/test never leaves an
orphaned `vX.Y.Z` tag or a GitHub Release with no matching npm version. Note
`prepublishOnly` _also_ runs `npm run build`, but relying on that alone is too
late — it fires during step 5, after the tag is already pushed.

## Auth: OIDC trusted publishing (what we use)

The modern npm approach (2025+). No long-lived secret in GitHub: the workflow
mints a short-lived OIDC token and npm verifies it, and **provenance is attached
automatically**. This is what `release.yml` is wired for.

- Targets the **public** registry, `registry.npmjs.org` — the same registry that
  already hosts the package (`publishConfig.registry` in `package.json`). Not
  GitHub Packages, not a private registry.
- **Publisher identity is the repo/workflow, not a person.** Trusted publishing
  binds the right to publish to `e11community/envtemplate` + `release.yml`, and
  the provenance attestation is signed by the CI run via Sigstore (recording
  "built by this repo @ this commit via this workflow"). Nobody signs it with a
  personal account or key — that's the supply-chain point.
- Requires `permissions: id-token: write` on the job (set).
- Requires **npm ≥ 11.5.1** — node24's bundled npm may be older, so the workflow
  runs `npm install -g npm@latest` before publishing.
- No `NODE_AUTH_TOKEN`, no `NPM_TOKEN` secret.

### One-time setup on npmjs.com — when you can begin

You can do this **now** — `@e11community/envtemplate` already exists on npmjs.com
(v1.0.2), so there's no chicken-and-egg first-publish token to deal with.

1. Open the package → **Settings → Trusted Publishing**.
2. Add a **GitHub Actions** publisher:
   - Repository: `e11community/envtemplate`
   - Workflow filename: `release.yml`
   - Environment: _(leave blank — the workflow uses none)_
3. Save. It takes effect on the **next releasable merge to `main`** (a `feat` /
   `fix` / `perf` or breaking change). The current modernization PR is `chore:`,
   so it won't itself trigger a publish — the first OIDC publish happens on the
   next feature/fix that lands.

### Alternative — `NPM_TOKEN` secret

If you ever can't use OIDC (e.g. a registry without trusted-publishing support):

- Create a granular/automation token on npmjs.com, store it as the `NPM_TOKEN`
  repo secret.
- `actions/setup-node` must set `registry-url: 'https://registry.npmjs.org'`
  (this writes the `.npmrc` that reads `NODE_AUTH_TOKEN`).
- Publish step: `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.
- For provenance, add `permissions: id-token: write` and `npm publish --provenance`.
- Trade-off: a long-lived credential lives in GitHub secrets.

## Caveats

- **`publishConfig` is already correct** — `access: public` and the public
  registry are set in `package.json`, so no `--access public` flag is needed.
- **`files` allowlist gates the tarball** — only `dist/`, `action.yml`, and
  `README.md` ship. Dev scaffolding (`.husky`, `.vscode`, `docs`, workflows,
  configs) is excluded regardless of `.npmignore`. If you add a runtime file the
  package needs, add it to `files`.
- **Version is bookkeeping for the action, the source of truth for npm.** Action
  consumers pin tags, not the npm version — but `npm version` uses `package.json`
  as the bump base and npm publishes exactly that number, so the bumped version
  in the `chore(release)` commit _is_ what gets published.
- **`[skip ci]` does not affect publish** — publish runs inside the same job that
  creates the release commit, not as a reaction to it, so the loop guard on the
  release commit is irrelevant to publishing.
- **Re-runs are not idempotent** — npm refuses to republish an existing version.
  If a release job fails _after_ `npm publish` but before finishing, a naive
  re-run will fail at publish. Prefer `npm publish || true` only with care, or
  guard on whether the version already exists.
- **`prepublishOnly` rebuilds `dist/`** — harmless (deterministic, matches the
  committed bundle that `validate.yml` already guards), just be aware it runs.
