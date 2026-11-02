// Conventional Commits: type(scope): subject, e.g. "fix(auth): rotate refresh token".
// Enforced by the commit-msg hook (.husky/commit-msg) and in CI.
export default {
  extends: ['@commitlint/config-conventional'],
};
