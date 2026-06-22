---
name: code-workspace
description: Use when an agent needs to inspect a repository, edit code, run local commands, add tests, debug failures, or prepare implementation changes in the workspace.
---

# Code Workspace

## Workflow

1. Inspect the repository shape and relevant files before editing.
2. Prefer existing patterns, local helpers, and project conventions.
3. Keep changes scoped to the requested behavior.
4. Add or update tests when behavior changes or regression risk is meaningful.
5. Run the narrowest useful verification first, then broader build/test commands when needed.
6. Summarize changed files, core logic, and verification results.

## Guardrails

- Do not overwrite unrelated user changes.
- Do not run destructive git commands unless explicitly requested.
- Do not hide errors behind broad fallback logic unless the requirement calls for it.
- Do not create temporary scripts or generated data that remain in the working tree.
