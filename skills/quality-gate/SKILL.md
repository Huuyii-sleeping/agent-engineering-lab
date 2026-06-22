---
name: quality-gate
description: Use when an agent needs to verify changes with tests, builds, smoke checks, regression checks, release readiness review, or failure triage.
---

# Quality Gate

## Workflow

1. Identify the behavior under test and the highest-risk integration points.
2. Run focused tests that prove the changed behavior first.
3. Run broader build or regression commands when the blast radius warrants it.
4. Inspect failures before retrying; distinguish product bugs from environment issues.
5. Report exact commands, outcomes, warnings, and residual risk.

## Guardrails

- Do not claim verification passed unless commands actually completed successfully.
- Do not ignore flaky or unrelated failures without explaining the evidence.
- Do not replace functional verification with screenshots when logic changed.
- Clean temporary test data and generated artifacts before handoff.
