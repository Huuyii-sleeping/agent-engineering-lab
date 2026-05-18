# Skills PRD-67 Implementation Plan

## Scope

Implement the Skills runtime improvements from PRD-67 without adding network installation, a general command runner, or a third-party YAML/glob dependency.

## Existing Structure

- `apps/agent-cli/src/skills/loader.ts` discovers and parses local `SKILL.md` files.
- `apps/agent-cli/src/tools/skills.ts` exposes `list_skills` and `load_skill`.
- `apps/agent-cli/src/config.ts` injects configured skills into the static prompt.
- `apps/agent-cli/test/unit/skills-loader.test.ts` covers basic discovery and configured skill selection.

## Tasks

1. Add tests first.
   - Cover rich frontmatter parsing.
   - Cover source trust and shell policy.
   - Cover variable expansion.
   - Cover path condition matching.
   - Cover tool output governance fields.

2. Extend skill metadata.
   - Add typed fields for `allowedTools`, `model`, `pathPatterns`, `sourceType`, `containsShellCommands`, and `canRunShell`.
   - Preserve raw `metadata` compatibility.
   - Support comma-separated and YAML-list frontmatter values.

3. Add context helpers.
   - Add `${SKILL_DIR}` and `${SESSION_ID}` content expansion.
   - Add `skillMatchesPaths()` and `selectSkillsForContext()`.
   - Add conservative path matching for exact paths, directory prefixes, `/**`, and single `*` segments.

4. Update tool and prompt surfaces.
   - Include governance metadata in `list_skills`.
   - Include governance metadata and expanded content in `load_skill`.
   - Add compact metadata header to prompt skill blocks.

5. Verify and archive.
   - Run targeted skill/tool tests.
   - Run `pnpm --filter agent-cli build`.
   - Run `git diff --check`.
   - Move PRD-67 from `prd/incremental` to `prd/archive`.

## Reserved Gaps

- No general skill command execution tool in this PRD.
- No full YAML parser or full glob engine dependency.
- No remote skill installation, signature verification, or package lock format.
