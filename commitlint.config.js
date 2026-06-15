// Copy to commitlint.config.js in a TypeScript action repo.
// Enforces Conventional Commits, which the release workflow parses to decide the version bump.
module.exports = {extends: ['@commitlint/config-conventional']}
