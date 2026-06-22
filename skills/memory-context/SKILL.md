---
name: memory-context
description: Use when an agent needs to apply persisted user preferences, project background, prior decisions, local conventions, or historical context while doing current work.
---

# Memory Context

## Workflow

1. Identify which stored context is relevant to the current request.
2. Apply stable preferences and project conventions without re-asking.
3. Treat historical conclusions as context, not as unchangeable truth.
4. Surface conflicts between memory and current repository state.
5. Update downstream work products only when current evidence supports the remembered context.

## Guardrails

- Do not expose private memory unless the user asks for it or it is necessary to explain a decision.
- Do not prefer memory over current files, tests, logs, or user instructions.
- Do not silently apply stale assumptions when dates, APIs, or policies may have changed.
