# Publishing

`@e11community/envtemplate` is unusual: it's **both** a GitHub Action (consumed by git ref,
`e11community/envtemplate@v1`) **and** a published npm package (consumed via `npm i -g` /
`npx envtemplate`). Both channels are automated by
[`release-please.yml`](../.github/workflows/release-please.yml); this doc records how, and the
one-time npmjs.com setup it depends on.

## The release flow (PR-based, via release-please)

Releases are **PR-based**, which is what lets a locked default branch work with **no GitHub
App** (see [ADMIN.md](ADMIN.md)):

1. Conventional-commit features/fixes land on `main` (each via a `@release`/`@devops`-merged PR).
2. `release-please` maintains a **release PR** containing the version bump + `CHANGELOG.md`. It
   pushes only its own `release-please--*` branch — **never `main`**.
3. A `@release`/`@devops` member **merges the release PR**. That human merge lands the bump on
   `main` and triggers the workflow again, where release-please tags `vX.Y.Z` and creates the
   GitHub Release (`releases_created=true`).
4. The gated **`publish` job** then rebuilds + tests, **force-moves the rolling `vMAJOR`** tag
   (release-please cuts `vX.Y.Z` but does not maintain the `@v1` alias consumers pin), and
   **publishes to npm** via OIDC.

A non-releasing change (`ci:` / `chore:` / `docs:`) on `main` produces no release PR.

## Why publish is folded into the release workflow (not a separate one)

The `publish` job lives inside `release-please.yml`, gated on `releases_created` — **not** a
separate `publish.yml` triggered `on: release:` or on the `v*` tag. A tag/release created by the
workflow's own `GITHUB_TOKEN` does **not** cascade to trigger another workflow (GitHub's
loop-prevention guard), so a separate publisher would wait for an event that never arrives. The
follow-on run that tags + publishes _does_ fire — because it's triggered by the **human** merging
the release PR, and human pushes cascade normally.

### Ordering: build + test before tagging/publishing

The `publish` job runs `npm ci` → `npm run build` → `npm test` before `npm publish`, so a broken
bundle never ships. (`prepublishOnly` rebuilds again at publish time — redundant but harmless.)

## Auth: OIDC trusted publishing (what we use)

The modern npm approach (2025+). No long-lived secret in GitHub: the workflow mints a short-lived
OIDC token and npm verifies it, and **provenance is attached automatically**.

- Targets the **public** registry, `registry.npmjs.org` — the same registry that already hosts
  the package (`publishConfig.registry` in `package.json`). Not GitHub Packages, not a private
  registry.
- **Publisher identity is the repo/workflow, not a person.** Trusted publishing binds the right
  to publish to `e11community/envtemplate` + `release-please.yml`, and the provenance attestation
  is signed by the CI run via Sigstore (recording "built by this repo @ this commit via this
  workflow"). Nobody signs it with a personal account or key — that's the supply-chain point.
- Requires `permissions: id-token: write` on the publish job (set).
- Requires **npm ≥ 11.5.1** — node24's bundled npm may be older, so the job runs
  `npm install -g npm@latest` before publishing.
- No `NODE_AUTH_TOKEN`, no `NPM_TOKEN` secret.

### One-time setup on npmjs.com — when you can begin

You can do this **now** — `@e11community/envtemplate` already exists on npmjs.com (v1.0.2), so
there's no chicken-and-egg first-publish token to deal with.

1. Open the package → **Settings → Trusted Publishing**.
2. Add a **GitHub Actions** publisher:
   - Repository: `e11community/envtemplate`
   - Workflow filename: **`release-please.yml`**
   - Environment: _(leave blank — the workflow uses none)_
3. Save. It takes effect on the **next release** — i.e. when a `@release`/`@devops` member merges
   the release PR that release-please raises after a `feat`/`fix`/`perf` (or breaking) change
   lands on `main`.

### Alternative — `NPM_TOKEN` secret

If you ever can't use OIDC (e.g. a registry without trusted-publishing support):

- Create a granular/automation token on npmjs.com, store it as the `NPM_TOKEN` repo secret.
- `actions/setup-node` must set `registry-url: 'https://registry.npmjs.org'` (this writes the
  `.npmrc` that reads `NODE_AUTH_TOKEN`).
- Publish step: `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.
- For provenance, keep `permissions: id-token: write` and use `npm publish --provenance`.
- Trade-off: a long-lived credential lives in GitHub secrets.

## Caveats

- **`publishConfig` is already correct** — `access: public` and the public registry are set in
  `package.json`, so no `--access public` flag is needed.
- **`files` allowlist gates the tarball** — only `dist/`, `action.yml`, and `README.md` ship. Dev
  scaffolding (`.husky`, `.vscode`, `docs`, workflows, configs) is excluded regardless of
  `.npmignore`. If you add a runtime file the package needs, add it to `files`.
- **release-please owns the version.** It computes the next version from the conventional commits,
  writes it into `package.json` (and `.release-please-manifest.json`) inside the release PR, and
  that's exactly the version `npm publish` ships. The `vX.Y.Z` tag is the source of truth for the
  action; the npm version matches it.
- **Re-runs are not idempotent** — npm refuses to republish an existing version. If the `publish`
  job fails _after_ `npm publish` but before finishing, a naive re-run fails at publish. Guard on
  whether the version already exists before retrying.
- **`prepublishOnly` rebuilds `dist/`** — harmless (deterministic, matches the committed bundle
  that `validate.yml` already guards), just be aware it runs.
