# production-runtime-architecture Specification

## ADDED Requirements

### Requirement: Ink TSX CLI prompt MUST support cursor navigation

Ink/TSX CLI prompt MUST support single-line cursor navigation with left/right arrows and MUST apply editing operations at the current cursor position.

#### Scenario: Cursor moves within typed text

- **WHEN** prompt draft contains text
- **AND** user presses left or right arrow
- **THEN** cursor moves within the draft without changing text content

#### Scenario: Text inserts at cursor position

- **WHEN** prompt cursor is in the middle of draft text
- **AND** user types additional characters
- **THEN** new characters are inserted at the cursor position
- **AND** cursor moves after the inserted characters

#### Scenario: Delete operations follow cursor position

- **WHEN** prompt cursor is in the middle of draft text
- **THEN** backspace deletes the character before cursor
- **AND** delete deletes the character after cursor
