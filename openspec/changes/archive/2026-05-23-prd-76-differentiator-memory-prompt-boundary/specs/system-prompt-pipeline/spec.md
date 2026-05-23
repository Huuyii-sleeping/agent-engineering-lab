## ADDED Requirements

### Requirement: Agent memory prompt MUST bound current index size

Agent Memory stable prompt section MUST bound injected `currentIndex` content by both line count and character count, and MUST disclose when truncation occurs.

#### Scenario: Long agent memory index is truncated
- **WHEN** agent memory `currentIndex` exceeds the configured prompt boundary
- **THEN** primary system prompt includes only the bounded prefix
- **AND** primary system prompt includes a truncation notice with original size and retained limit

#### Scenario: Short agent memory index is preserved
- **WHEN** agent memory `currentIndex` is below the prompt boundary
- **THEN** primary system prompt includes the index content unchanged
- **AND** no truncation notice is added
