---
name: browser-research
description: Use when an agent needs to research web pages, compare sources, extract evidence, and return cited findings from browser-accessible content.
---

# Browser Research

## Workflow

1. Clarify the research question, expected freshness, and source constraints.
2. Search focused sources before broad web search when an authoritative domain is known.
3. Open primary sources first, then use secondary sources only to fill context.
4. Extract facts with source URLs, publication dates, and uncertainty notes.
5. Return a concise answer with citations and a short reliability assessment.

## Guardrails

- Do not treat search snippets as evidence.
- Prefer official docs, primary publications, standards bodies, and source repositories.
- Flag stale or conflicting information instead of smoothing over differences.
- Avoid submitting forms or changing remote state unless the user explicitly asks.
