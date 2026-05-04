# Commit Convention

This repository uses Conventional Commits:

`<type>(<scope>): <subject>`

Examples:

- `feat(api): add user profile endpoint`
- `fix(parser): handle empty input`
- `docs(readme): clarify setup steps`
- `chore(git): enforce commit message format`

Allowed `type` values:

- `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Rules:

- `scope` is optional, but recommended.
- `subject` uses imperative style and should be concise.
- Add `!` for breaking changes, for example: `feat(api)!: remove v1 endpoint`.

Enforcement:

- `.githooks/commit-msg` validates the first commit message line.
- `.gitmessage.txt` is the default commit template.

