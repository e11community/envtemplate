# Publishing

`@e11community/envtemplate` is unusual: it's **both** a GitHub Action (consumed
by git ref, `e11community/envtemplate@v1`) **and** a published npm package
(consumed via `npm i -g` / `npx envtemplate`). The two distribution channels
have different mechanics, and the npm-publish side is **not yet wired** — this
doc is the recommendation for adding it.

## Current state

- **Action channel** — fully automated. `release.yml` bumps the version,
  regenerates `CHANGELOG.md`, tags `vX.Y.Z`, force-moves the `vMAJOR` pointer,
  and cuts a GitHub Release on every releasable merge to `main`. Consumers
  pinning `@v1` track it automatically.
- **npm channel** — **manual.** Nothing runs `npm publish`. Today a release
  ships the action but does **not** update the npm package.
- **Testing** — `validate.yml`'s `check` job runs `npm test` on every PR and
  push to `main`, so the published package is gated by the suite.

## Recommendation: fold `npm publish` into `release.yml`

Add publishing to the existing `release` job — **do not** create a separate
`publish.yml`.

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

## Auth: two options

### Option A — OIDC trusted publishing (recommended)

The modern npm approach (2025+). No long-lived secret in GitHub: the workflow
mints a short-lived OIDC token and npm verifies it, and **provenance is attached
automatically**.

- Requires `permissions: id-token: write` on the job.
- Requires **npm ≥ 11.5.1** — node24's bundled npm may be older, so upgrade in
  the workflow: `npm install -g npm@latest`.
- **One-time npm-side setup:** on npmjs.com, configure the package as a _trusted
  publisher_ pointing at `e11community/envtemplate` + `.github/workflows/release.yml`.
- No `NODE_AUTH_TOKEN`, no `NPM_TOKEN` secret.

### Option B — `NPM_TOKEN` secret

Classic approach; works on any npm version.

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
