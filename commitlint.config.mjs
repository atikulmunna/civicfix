// Conventional Commits: type(scope): subject, e.g. "fix(auth): rotate refresh token".
// Enforced by the commit-msg hook (.husky/commit-msg) and in CI.
export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot's generated bodies quote release notes with long lines. Its
  // updates are re-applied in commits that follow these rules, so its own
  // messages are exempt rather than relaxing the limits for everyone.
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
};
