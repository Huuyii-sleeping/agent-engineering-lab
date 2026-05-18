# MCP Implementation Hardening Plan

## Context

The Claude Code MCP analysis highlights a production MCP surface built around cached connections, guarded server startup, deterministic tool naming, description truncation, authentication/session failure handling, IDE allowlists, and unified tool registration. This repository already has JSON-RPC stdio clients, config loading, trusted-server gating, privacy allowlists, registry caching, and MCP tool execution. The implementation should strengthen the existing architecture instead of replacing it with a full OAuth or multi-transport stack.

## File Responsibilities

- `apps/agent-cli/src/tools/mcp-protocol.ts`: protocol normalization, tool aliasing, descriptor sanitization/truncation, MCP failure classification helpers.
- `apps/agent-cli/src/tools/mcp-config.ts`: config normalization, per-server capabilities such as IDE tool allowlists and concurrency options.
- `apps/agent-cli/src/tools/mcp-client.ts`: lifecycle handling, session/auth error classification, reconnect semantics.
- `apps/agent-cli/src/tools/mcp-registry.ts`: cached registration building, trusted gating, per-server concurrency and failure caching.
- `apps/agent-cli/src/tools/protocol.ts`: final OpenAI tool schema description formatting and truncation.
- `apps/agent-cli/test/unit/tools/*mcp*.test.ts`: focused regression coverage.

## Tasks

1. Add RED tests for protocol hardening.
   - Tool descriptions are sanitized and capped.
   - Tool aliases remain deterministic and collision-safe.

2. Add RED tests for config hardening.
   - `allowedTools` / `disabledTools` / `maxConcurrentCalls` normalize from `.codex/mcp.json`.
   - Tool allow/deny lists are lower-cased and de-duplicated.

3. Add RED tests for registry hardening.
   - Tool registration honors IDE/server allowlists and denylists.
   - Concurrent calls to the same server obey `maxConcurrentCalls`.
   - Authentication failures are cached and short-circuit subsequent calls.

4. Implement protocol/config changes.
   - Add constants and helpers for MCP description max length.
   - Extend `McpServerConfig` with `allowedTools`, `disabledTools`, `maxConcurrentCalls`.

5. Implement client/registry changes.
   - Classify auth and session-expired errors.
   - Reset and retry session-expired failures once through existing retry loop.
   - Cache auth failures per server in the registry.
   - Gate remote tool registration by allow/deny lists.
   - Serialize/limit calls using a small per-server limiter.

6. Verify.
   - Run targeted MCP unit tests.
   - Run full `pnpm.cmd --filter agent-cli test`.
   - Run `pnpm.cmd --filter agent-cli build`.
