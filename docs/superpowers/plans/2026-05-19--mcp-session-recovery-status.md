# MCP Session Recovery and Status Plan

## Context

The MCP hardening pass added description governance, allow/deny lists, concurrency limits, and auth failure caching. Remaining high-value gaps are session-expired recovery and local operator visibility/reset controls. This change should stay within the current stdio MCP architecture and not introduce OAuth or new transports.

## Tasks

1. Add RED tests for session-expired recovery.
   - Fixture exposes a tool that fails once with a session-expired JSON-RPC error and then succeeds.
   - Registry closes/restarts the client and retries without surfacing the transient failure.

2. Add RED tests for MCP status/reset control.
   - Registry exposes server status including tool counts, concurrency config, active calls, queued calls, and auth failure state.
   - Reset clears cached auth failures.
   - CLI `/mcp` renders status and `/mcp reset` reports reset.

3. Implement registry status/reset.
   - Add `getStatus()` and `resetAuthFailures()`.
   - Include status in module-level helpers in `tools/mcp.ts`.

4. Implement session-expired retry.
   - Classify `MCP_SESSION_EXPIRED` as retryable even when max retry attempts is zero.
   - Close the client, retry once, and do not cache it as auth failure.

5. Wire CLI.
   - Add context methods for MCP status/reset.
   - Add `renderCliMcpStatus()`.
   - Add `/mcp` and `/mcp reset` command handling.

6. Verify.
   - Run targeted MCP/CLI tests.
   - Run full agent-cli tests and build.
