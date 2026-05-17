# Agent Memory PRD-65 Implementation Plan

## Scope

Implement the PRD-65 foundation in the existing `agent-cli` runtime without replacing the entire agent architecture in one pass.

This plan ships the durable local memory substrate plus local equivalents for Agent Memory prompt binding, Session Memory summaries, Team Memory file sync, and hybrid local recall. Remote/cloud Team Memory sync, model-backed background summarization, external embedding services, and UI browser remain explicit reserved gaps surfaced by doctor/explain tools.

## Existing Structure

- `apps/agent-cli/src/memory/store.ts` owns `.memory/short_term.jsonl` and `.memory/long_term.jsonl`.
- `apps/agent-cli/src/memory/retrieval.ts` ranks JSONL entries.
- `apps/agent-cli/src/memory/injection.ts` formats `<memory_context>`.
- `apps/agent-cli/src/memory/service.ts` exposes tool-facing functions.
- `apps/agent-cli/src/tools/memory.ts` defines `memory_add`, `memory_search`, `memory_list`.
- `apps/agent-cli/src/tools/base.ts` registers tool handlers.
- `apps/agent-cli/src/runtime/query-preparation.ts` controls auto extraction and injection.
- `apps/agent-cli/src/tools/context-compact.ts` owns compact transcript snapshots.

## Tasks

1. Add tests first.
   - Touch `apps/agent-cli/test/unit/memory/store.test.ts`.
   - Add coverage for durable markdown topic creation, metadata index/events, rebuild, explainable search, and Chinese extractor rules.
   - Verification: targeted `vitest` memory tests fail before implementation.

2. Add durable memory file store.
   - Add `apps/agent-cli/src/memory/files.ts`.
   - Extend `apps/agent-cli/src/memory/types.ts`.
   - Implement scope resolver, sanitized project key, `MEMORY.md`, `memories/*.md`, `.metadata/index.json`, `.metadata/events.jsonl`, atomic writes, index rebuild, doctor snapshot, and path metadata.
   - Keep paths under `process.cwd()/.memory/projects/<projectKey>/memory` by default.

3. Keep JSONL compatibility while writing durable memory.
   - Touch `apps/agent-cli/src/memory/store.ts`.
   - `add()` continues writing short/long JSONL, then writes/updates durable Auto Memory topic.
   - `delete()` removes matching durable topic metadata where possible.

4. Upgrade retrieval and injection.
   - Touch `apps/agent-cli/src/memory/retrieval.ts`, `injection.ts`, `service.ts`, `response.ts`.
   - Include durable topic hits with `scope/path/reason/checksum`.
   - Add `memory_explain`, `memory_doctor`, `memory_rebuild_index`.
   - Keep old `memory_search` response shape compatible by returning JSONL-style fields plus optional provenance.

5. Register new tools.
   - Touch `apps/agent-cli/src/tools/memory.ts`, `apps/agent-cli/src/tools/base.ts`, `apps/agent-cli/src/services/memory-service.ts`.
   - Mark only read-only explain/doctor as replay safe. Keep write-capable tools blocked during replay dry-run.

6. Fix extractor mojibake and privacy honesty.
   - Touch `apps/agent-cli/src/memory/extractor.ts`.
   - Use readable Chinese/English rules for preference, constraint, decision.
   - Ensure doctor reports implemented local memory scopes as available/empty and keeps only remote/cloud/model-backed gaps reserved.

7. Complete PRD-65 local equivalents.
   - Add Agent Memory prompt binding in stable prompt sections.
   - Add deterministic local vector score breakdown to explainable recall.
   - Add local `team_memory_sync` for `.agent/team-memory/MEMORY.md` with checksums.
   - Add explicit `memory_session_summarize` for `.sessions/<sessionId>/session-memory.md`.

8. Verify.
   - Run targeted memory unit tests.
   - Run `pnpm --filter agent-cli test:memory`.
   - Run `pnpm --filter agent-cli build`.
   - Check `git status --short`.
