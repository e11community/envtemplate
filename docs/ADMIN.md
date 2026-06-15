# Admin setup

One-time, org-admin tasks: creating the repo in the org and protecting the default
branch. Everything here uses the [`gh`](https://cli.github.com/) CLI.

## Prerequisites

- `gh auth status` shows you authenticated, with **org-admin / repo-admin** rights (creating
  repos and writing rulesets both require admin).

## 1. Create the repo in the org

```bash
ORG=e11community
REPO=envtemplate
DESC="Render an output file from a template with \${VAR} substitution from environment variables."

# Public: an action consumed as `owner/action@v1` shouldn't require auth just to be reused.
gh repo create "$ORG/$REPO" --public --description "$DESC"
```

Create the action repo **public** — actions are referenced by ref (`owner/action@v1`)
and consumers shouldn't have to authenticate just to reuse one. (Any private repos the
action _operates on_ are a separate concern, handled by its own auth.)

## 2. Protect the default branch (block deletion + force-push)

This is **lightweight** protection: it prevents accidental deletion of `main` and history
rewrites (force-push), but does **not** require pull requests or status checks — so the
[`release`](../.github/workflows/release.yml) workflow can still push its `chore(release)`
commit directly with the built-in `GITHUB_TOKEN`, no PAT needed.

We use a **ruleset** (modern API) rather than classic branch protection: it maps exactly to
these two rules and can be created even before the branch exists.

```bash
ORG=e11community
REPO=envtemplate

gh api -X POST "repos/$ORG/$REPO/rulesets" --input - <<'JSON'
{
  "name": "default-branch-guard",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
```

- `deletion` → cannot delete `main`.
- `non_fast_forward` → cannot force-push `main`.

Verify: `gh api "repos/$ORG/$REPO/rulesets" --jq '.[].name'`

### Why this does NOT break releases or the `v1` tag move

- **Release commit:** the workflow pushes a normal **fast-forward** commit to `main` — not a
  force-push — so `non_fast_forward` never trips.
- **Major-tag move (`v1`):** `vMAJOR` is a **tag**, not a branch. Branch rules
  (`target: branch`) never apply to `refs/tags/*`, so force-moving `v1` keeps working. Only an
  explicit **tag** ruleset (`target: tag`) matching `v*` would block it — deliberately not created.

### If you later want stricter protection

Adding **Require a pull request before merging** (or required status checks / signed commits)
blocks the workflow's direct push. To keep auto-release working you'd then either: add the
`github-actions` bot to the ruleset **bypass list**, push the release commit with a **GitHub App
token** (or fine-grained PAT) that has bypass, or switch to a release-PR model.
