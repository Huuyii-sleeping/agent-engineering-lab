## ADDED Requirements

### Requirement: Scheduler SHALL support cron misfire policies

Scheduler SHALL support `fire_once`, `skip`, and `catch_up` misfire policies on cron schedules. Missing or invalid policy values MUST migrate to `fire_once`. `catch_up` MUST respect a bounded `max_catch_up`.

#### Scenario: skip policy records skipped history
- **WHEN** an overdue cron schedule uses `misfire_policy = "skip"`
- **THEN** scheduler does not generate a scheduled prompt notification
- **AND** scheduler records a `skipped` history entry
- **AND** scheduler advances `next_run_at` to a future cron match

#### Scenario: catch_up policy emits bounded notifications
- **WHEN** an overdue cron schedule uses `misfire_policy = "catch_up"`
- **THEN** scheduler generates scheduled prompt notifications for missed runs up to `max_catch_up`
- **AND** scheduler advances `next_run_at` beyond the current tick time

### Requirement: Scheduler SHALL expose production management tools

Scheduler SHALL expose tools to pause, resume, and update schedules. Paused schedules MUST NOT fire. Resumed schedules SHALL recompute `next_run_at`. Update SHALL allow changing prompt, cron, recurring, misfire policy, and catch-up limit while preserving schedule identity.

#### Scenario: paused schedule does not fire
- **WHEN** a schedule is paused before it becomes due
- **THEN** scheduler does not generate notifications for that schedule

#### Scenario: update schedule recalculates next run
- **WHEN** a cron schedule is updated with a new cron expression
- **THEN** scheduler validates the expression
- **AND** scheduler recalculates `next_run_at`

### Requirement: Scheduler SHALL expose production stats

Scheduler SHALL expose `schedule_stats` with counts for schedules, enabled schedules, disabled schedules, pending notifications, history entries, active leases, overdue schedules, and last tick metadata.

#### Scenario: read scheduler stats
- **WHEN** `schedule_stats` is called
- **THEN** scheduler returns structured counts and last tick metadata

### Requirement: Scheduler store SHALL write JSON atomically

Scheduler store SHALL write records, notifications, history, and lock files through a same-directory temporary file followed by rename.

#### Scenario: save records uses atomic replacement
- **WHEN** scheduler persists records
- **THEN** the target JSON file is replaced through a completed temporary write
