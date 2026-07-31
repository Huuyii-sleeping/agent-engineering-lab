# Memory Module

This directory owns the local memory subsystem for `agent-cli`.

## Current Layers

- JSONL compatibility layer:
  - `.memory/short_term.jsonl`
  - `.memory/long_term.jsonl`
- Durable project memory:
  - `.memory/projects/<project-key>/memory/MEMORY.md`
  - `.memory/projects/<project-key>/memory/memories/*.md`
  - `.memory/projects/<project-key>/memory/.metadata/index.json`
  - `.memory/projects/<project-key>/memory/.metadata/events.jsonl`

The JSONL layer remains compatible with existing tools. New durable entries are also written as human-readable markdown topics with a machine-readable index and append-only audit events.

## Responsibilities

- `types.ts`: shared memory types, including JSONL entries, durable topics, scopes, and search hits.
- `files.ts`: durable markdown memory store, path resolution, index rebuild, doctor snapshot, and audit events.
- `store.ts`: compatibility facade that writes short-term, long-term, and durable project memory.
- `retrieval.ts`: search/list orchestration across JSONL and durable memory with hybrid keyword, bigram, and local hashed-vector scoring.
- `injection.ts`: `<memory_context>` formatting with provenance, scope, path, and reason.
- `extractor.ts`: rule-based candidate extraction from Chinese and English user text.
- `service.ts`: tool-facing API for add/search/list/explain/doctor/rebuild-index/team-sync/session-summary.
- `response.ts`: consistent JSON tool responses.

## Tool Surface

- `memory_add`: writes redacted memory to short-term, long-term, and durable project memory.
- `memory_search`: returns ranked memory hits.
- `memory_list`: lists entries by `short_term`, `long_term`, `durable`, or `both`.
- `memory_explain`: explains score, score breakdown, retrieval mode, scope, path, reason, and token cost for matched entries.
- `memory_doctor`: reports memory classes, local paths, topic counts, and reserved gaps.
- `memory_rebuild_index`: rebuilds durable metadata from markdown topic files.
- `agent_memory_snapshot`: inspects or initializes project/user/local agent memory from `.agent/agent-memory-snapshots/<agentType>`.
- `memory_migrate_jsonl`: dry-runs or applies migration from `long_term.jsonl` into durable markdown topics.
- `team_memory_sync`: pushes, pulls, or checks local team memory at `.agent/team-memory/MEMORY.md`.
- `memory_session_summarize`: writes `.sessions/<sessionId>/session-memory.md` explicitly for later compaction reuse.

## Session Memory

`compact` can write `.sessions/<sessionId>/session-memory.md` when the compact runtime context includes a session id. Later compacts for the same session reuse that summary inside the compacted assistant message. `memory_session_summarize` exposes the same local session-memory target for explicit background-worker summaries.

This is a deterministic local summary path, not yet a model-backed background summarizer.

## Agent Memory

Agent memory path helpers support `user`, `project`, and `local` scopes:

- user: `.memory/agent-memory/<agentType>/`
- project: `.agent/agent-memory/<agentType>/`
- local: `.agent/agent-memory-local/<agentType>/`

Snapshot initialization copies `.agent/agent-memory-snapshots/<agentType>/` into the selected agent memory directory only when the destination is empty.

Agent definitions can bind memory into the stable prompt through the `Agent Memory` prompt section. The section records agent type, scope, mode, memory directory, entrypoint, and the current index when available.

## Team Memory

Local team memory sync is implemented through `.agent/team-memory/MEMORY.md`. It supports `status`, `pull`, and `push` with checksums so multiple local agents can share a deterministic file contract. Managed remote/cloud team memory remains reserved.

## Retrieval

`memory_search` and `memory_explain` use `hybrid_keyword_bigram_local_vector`: keyword overlap, character bigram Jaccard similarity, deterministic local hashed-vector cosine similarity, confidence, and recency. No external embedding service is required for the local vector score.

## Reserved Gaps

The local durable foundation, compact session memory, explicit session summaries, agent memory prompt binding, agent memory path guards, snapshot initialization, local team memory sync, local vector scoring, and JSONL migration are implemented. These capabilities are intentionally exposed as reserved gaps until they are built:

- Managed Team Memory remote/cloud sync
- Model-backed Session Memory background summaries
- External embedding service integration

## Verification

Common checks:

```bash
pnpm --filter agent-cli test -- test/unit/memory/store.test.ts
pnpm --filter agent-cli test:memory
pnpm --filter agent-cli build
```
