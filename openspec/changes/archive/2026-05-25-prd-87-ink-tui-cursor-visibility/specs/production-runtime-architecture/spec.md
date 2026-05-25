# production-runtime-architecture Specification

## ADDED Requirements

### Requirement: Ink TSX CLI prompt MUST show an input cursor

Ink/TSX CLI surface MUST render a visible prompt cursor while running in interactive mode. The cursor MUST be visible when the draft is empty and when the user has typed text.

#### Scenario: Empty prompt remains visibly focused

- **WHEN** Ink TUI is interactive
- **AND** prompt draft is empty
- **THEN** prompt input renders a visible cursor
- **AND** placeholder text remains visible

#### Scenario: Typed prompt shows insertion point

- **WHEN** Ink TUI is interactive
- **AND** prompt draft contains text
- **THEN** prompt input renders the draft
- **AND** cursor appears at the draft insertion point
