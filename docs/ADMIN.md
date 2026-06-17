# Admin setup

One-time, org-admin tasks: creating the repo and locking the default branch so only the
release teams can land changes on it. Uses the [`gh`](https://cli.github.com/) CLI or the
repo Settings UI.

## Prerequisites

- `gh auth status` shows you authenticated, with **org-admin / repo-admin** rights (creating
  repos and writing rulesets both require admin).
- The `@e11community/release` and `@e11community/devops` teams exist — they gate the default
  branch below.

## 1. Create the repo in the org

```bash
ORG=e11community
REPO=envtemplate
DESC="Render an output file from a template with \${VAR} substitution from environment variables."

# Public: an action consumed as `owner/action@v1` shouldn't require auth just to be reused.
gh repo create "$ORG/$REPO" --public --description "$DESC"
```

Create the action repo **public** — actions are referenced by ref (`owner/action@v1`) and
consumers shouldn't have to authenticate just to reuse one. (Any private repos the action
_operates on_ are a separate concern, handled by its own auth.)

## 2. Lock the default branch to the release teams

Goal: anyone with write can branch, open PRs, and review on non-default branches, but **only
`@release` and `@devops` can land changes on `main`** — with **no required approval**, so a
single release-team member can merge their own PR. This rides the _push-permission_ plane, not
the _approval_ plane, so it sidesteps GitHub's rule that an author can't approve their own PR.

The mechanism is a ruleset with the **"Restrict updates"** rule plus the two teams in the
**bypass list**. "Restrict updates" means _only bypass actors may update the branch_ — so the
teams become the de-facto allow-list for merging to `main`.

### Via the UI (Settings → Rules → Rulesets)

1. Open the existing `protect-default` ruleset (or **New branch ruleset**). Enforcement: **Active**.
2. **Bypass list → Add bypass → Teams:** add **`release`** and **`devops`**, each mode **Always**.
3. **Target branches:** Include default branch.
4. **Rules** — enable exactly:
   - ✅ Restrict deletions
   - ✅ Block force pushes
   - ✅ **Restrict updates**
   - Leave **"Require a pull request before merging" OFF** — that's the approval plane we avoid
     (it reintroduces the self-approval lockout). Optionally enable it with **0 required
     approvals** if you want to force even the teams through a PR.
5. Save.

### Via `gh` (equivalent)

```bash
ORG=e11community
REPO=envtemplate
REL=$(gh api "orgs/$ORG/teams/release" --jq .id)
DEV=$(gh api "orgs/$ORG/teams/devops" --jq .id)
ID=$(gh api "repos/$ORG/$REPO/rulesets" --jq '.[] | select(.name=="protect-default") | .id')

# Amend the existing ruleset in place (PUT .../rulesets/$ID), or POST .../rulesets to create one.
gh api -X PUT "repos/$ORG/$REPO/rulesets/$ID" --input - <<JSON
{
  "name": "protect-default",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": $REL, "actor_type": "Team", "bypass_mode": "always" },
    { "actor_id": $DEV, "actor_type": "Team", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "update" }
  ]
}
JSON
```

Verify: `gh api "repos/$ORG/$REPO/rulesets" --jq '.[].name'`

**Effect:** `@release`/`@devops` members can merge PRs (and push) to `main`; everyone else can
open PRs but the **merge is blocked** — the junior lockout. Pushes to non-default branches are
unaffected (the ruleset targets only `main`).

## 3. Why this needs no GitHub App, and why the bot is NOT a bypasser

The release pipeline ([`release-please.yml`](../.github/workflows/release-please.yml)) is
**PR-based**: release-please only pushes its own `release-please--*` branch and opens a PR — it
**never pushes to `main`**. A `@release`/`@devops` human merges that PR. Therefore:

- **The bot never updates the locked branch**, so it needs no bypass and no App/PAT.
- **You can't add the built-in Actions bot to a bypass list anyway.** `github-actions[bot]` is a
  system account, not one of the accepted bypass actor types (role / team / GitHub App /
  deploy key). GitHub deliberately disallows granting the Actions token blanket bypass.
- The **`vMAJOR` move** and the `vX.Y.Z` release tag are **tags**, not branch updates — branch
  rules (`target: branch`) never apply to `refs/tags/*` — so the bot writes them with the plain
  `GITHUB_TOKEN`. (Only an explicit `target: tag` ruleset would block that; none is created.)

If automation ever needed to push _directly to a locked branch_ (this repo doesn't), the
supported route is a **dedicated GitHub App** added to the bypass list — never the
`github-actions` bot.
