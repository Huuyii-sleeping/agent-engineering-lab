# Tool Call PRD-66 Implementation Plan

## Scope

Implement the local tool-call runtime improvements from PRD-66 without replacing the provider protocol or adding a full JSON Schema dependency.

## Existing Structure

- `apps/agent-cli/src/tools/protocol.ts` defines registration metadata and OpenAI tool projection.
- `apps/agent-cli/src/tools/registry.ts` builds builtin tool registrations.
- `apps/agent-cli/src/tools/catalog.ts` combines builtin and MCP registrations.
- `apps/agent-cli/src/tools/executor.ts` routes builtin, subagent, and MCP executions.
- `apps/agent-cli/src/runtime/tool-runtime.ts` parses arguments and protects handler execution.
- `apps/agent-cli/src/runtime/query-tools.ts` executes model tool calls inside the query loop.
- `apps/agent-cli/src/runtime/query-tool-executor.ts` runs hooks, protected execution, output scanning, and result events for one tool call.

## Tasks

1. Add PRD and tests first.
   - Add `prd/incremental/PRD-66-ToolCall实现链路增强与执行重构.md`.
   - Extend `tool-runtime`, `registry`, `catalog`, `service`, `builtin-executor`, `mcp-executor`, and `query-tools` unit tests.

2. Add tool execution metadata.
   - Extend `ToolRegistration` with `execution`.
   - Expose `readOnly`, `mutatesWorkspace`, `parallelSafe`, `riskLevel`, and optional `timeoutMs` through metadata.
   - Assign conservative builtin and MCP execution profiles.

3. Add conservative input validation.
   - Preserve legacy `parseToolArgs()` behavior for preview callers.
   - Add strict parse state through `resolveToolExecution()`.
   - Return `TOOL_INPUT_PARSE_ERROR` for malformed JSON.
   - Validate `required`, primitive `type`, `enum`, and array item type before invoking handlers.

4. Add query-stage batching.
   - Add `ToolService.getToolRegistration(name)`.
   - Build consecutive batches from model tool calls.
   - Run read-only parallel-safe batches with `Promise.all`.
   - Keep write-capable, high-risk, subagent, and unknown tools serial.
   - Append tool result messages in original tool_call order.

5. Verify.
   - Run targeted runtime/tool tests.
   - Run `pnpm --filter agent-cli build`.
   - Run `git diff --check`.

## Reserved Gaps

- Full JSON Schema draft validation remains out of scope.
- Cross-process cancellation and streaming tool results remain out of scope.
- MCP tools default to conservative serial execution unless future metadata makes parallel safety explicit.
