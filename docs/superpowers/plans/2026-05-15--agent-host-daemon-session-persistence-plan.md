# Agent Host / Daemon / Session Persistence Plan

## Context

This plan implements the first platformization step for `apps/agent-cli`: introduce a long-lived host, add daemon mode, and persist sessions across restarts. The goal is to improve local runtime durability and shared entrypoint behavior before tackling scheduler or plugin work.

## Task 1: Add host and session persistence primitives

Files to touch:

- `apps/agent-cli/src/host/agent-host.ts`
- `apps/agent-cli/src/service-api/session-store.ts`
- `apps/agent-cli/src/service-api/sessions.ts`
- `apps/agent-cli/test/unit/service-api/*.test.ts`

Steps:

1. Add a minimal `AgentHost` class that owns runtime services, query engine, sessions, and event subscribers.
2. Add a file-backed session store under `.sessions/`.
3. Teach host startup to load persisted sessions and expose query/update APIs.

Verification:

- Unit test host bootstrap with an empty store.
- Unit test restoring one persisted session.
- Unit test updating and reloading session state.

## Task 2: Introduce daemon mode and host-backed service composition

Files to touch:

- `apps/agent-cli/src/entrypoints/cli-dispatcher.ts`
- `apps/agent-cli/src/entrypoints/daemon.ts`
- `apps/agent-cli/src/service-api/index.ts`
- `apps/agent-cli/src/entrypoints/mcp-server.ts`
- `apps/agent-cli/src/entrypoints/tui.ts`

Steps:

1. Add a `daemon` CLI mode and dedicated entrypoint.
2. Route `AgentService` through a shared host abstraction.
3. Update MCP / TUI / HTTP composition to reuse host-owned runtime state where applicable.

Verification:

- Unit test CLI dispatcher daemon mode parsing.
- Unit test daemon entrypoint bootstraps host.
- Re-run service API / MCP / TUI focused tests.

## Task 3: TDD-driven regression coverage and docs alignment

Files to touch:

- `apps/agent-cli/test/unit/service-api/*.test.ts`
- `apps/agent-cli/test/unit/entrypoints/*.test.ts`
- `apps/agent-cli/README.md`
- `docs/architecture-glossary.md`

Steps:

1. Add failing tests before each behavior change.
2. Keep production changes minimal until tests go green.
3. Update docs only after behavior stabilizes.

Verification:

- Run focused vitest targets for host, service-api, and entrypoints.
- Confirm no chat/session contract regression in existing assertions.
