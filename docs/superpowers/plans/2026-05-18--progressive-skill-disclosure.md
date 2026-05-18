# Progressive Skill Disclosure Implementation Plan

## Context

The current skill runtime can discover skills and expose `list_skills` / `load_skill`, but configured skills are still expanded into the stable system prompt through `toPromptSkillBlocks()`. Claude Code-style progressive disclosure should keep startup prompt content compact, expose only metadata first, and load full `SKILL.md` content only when the model explicitly invokes `load_skill`.

## File Responsibilities

- `apps/agent-cli/src/skills/loader.ts`: skill discovery, metadata parsing, summary/full definitions, prompt catalog rendering, conditional path activation helpers.
- `apps/agent-cli/src/tools/skills.ts`: JSON tool outputs for listing and loading skills.
- `apps/agent-cli/src/config.ts`: stable prompt assembly.
- `apps/agent-cli/src/cli/ui.ts`: wording for skill loaded state.
- `apps/agent-cli/test/unit/skills-loader.test.ts`: loader behavior tests.
- `apps/agent-cli/test/unit/tools/index.test.ts`: tool surface regression tests.

## Tasks

1. Add tests for compact prompt catalog rendering.
   - Verify prompt catalog includes name, description, policy metadata, path, and explicit `load_skill` guidance.
   - Verify prompt catalog does not include body-only text.

2. Add tests for split summary/full loading.
   - Verify `listSkillSummaries()` discovers frontmatter/body-derived metadata without exposing full content.
   - Verify `loadSkill()` still returns full content.

3. Add tests for load-time base directory disclosure.
   - Verify `load_skill` JSON includes `base_dir`.
   - Verify expanded content includes a base directory preamble before full instructions.

4. Add tests for conditional skill activation.
   - Verify skills with `paths` are excluded from default prompt catalog.
   - Verify `activateConditionalSkillsForPaths()` returns matching path-scoped skills.

5. Implement loader changes.
   - Introduce `SkillSummary` and `LoadedSkillDefinition`.
   - Keep existing compatibility where feasible via type aliases and wrappers.
   - Add prompt catalog renderer and base-dir expansion helper.

6. Wire prompt and tools.
   - Update `config.ts` to use compact skill catalog blocks.
   - Update `list_skills` and `load_skill` outputs with summary/full semantics and `base_dir`.
   - Adjust CLI state wording from "loaded into prompt" to "configured".

7. Verify.
   - Run targeted skill/tool tests.
   - Run full `pnpm --filter agent-cli test`.
   - Run `pnpm --filter agent-cli build`.
