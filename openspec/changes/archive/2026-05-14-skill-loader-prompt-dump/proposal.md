## Why

对照参考架构页后，当前仓库还差两块明确的能力面没有落到真实产品表面：一是 `skills` 目前只有 prompt section 占位，没有真正的本地加载器和按名读取能力；二是缺少 `dump-system-prompt` 这种不进入模型请求链路的轻量 inspection 入口。把这两块补齐后，CLI/TUI 和底层 runtime 会更接近参考架构描述，而不是停留在文档预留态。

## What Changes

- 新增 `PRD-56`，补齐本地 skills 加载和 system prompt 导出入口。
- 增加 `SkillLoader`，扫描 `.codex/skills/**/SKILL.md`、`skills/**/SKILL.md` 和 `AGENT_SKILL_ROOTS`。
- 增加 `list_skills` / `load_skill` base tools。
- 增加 `AGENT_SKILLS` 选择式注入，让 skills 真正进入稳定 prompt。
- 增加 `/skills`、`/skill <name>`、`/prompt` 和 `agent-cli dump-system-prompt`。
- 同步 CLI help、completion、palette、TUI command surface 和主规格。

## In Scope

- skill discovery / loading
- skill tool surface
- stable prompt dump
- CLI / TUI 本地 inspection surface
- focused tests、build、OpenSpec strict

## Out of Scope

- 插件市场和远端 skill 分发
- skill 安装器 UI
- 复杂 prompt 模板 DSL

## Capabilities

### New Capabilities

- `skill-loading-runtime`: 本地 skill 发现、按名加载、tool surface 和 CLI/TUI inspection surface

### Modified Capabilities

- `system-prompt-pipeline`: 增加选择式 skills 注入和本地 prompt dump inspection 要求

## Impact

- 影响代码：
  - `apps/agent-cli/src/config.ts`
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-completion.ts`
  - `apps/agent-cli/src/cli-palette.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/entrypoints/cli-dispatcher.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/prompt/inspect.ts`
  - `apps/agent-cli/src/skills/loader.ts`
  - `apps/agent-cli/src/tools/base.ts`
  - `apps/agent-cli/src/tools/skills.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/skills-loader.test.ts`
  - `apps/agent-cli/test/unit/cli-commands.test.ts`
  - `apps/agent-cli/test/unit/cli-completion.test.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/cli-dispatcher.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/dump-system-prompt.test.ts`
  - `apps/agent-cli/test/unit/tools/index.test.ts`
- 影响文档：
  - `prd/incremental/PRD-56-技能加载与Prompt导出.md`
  - `openspec/specs/skill-loading-runtime/spec.md`
  - `openspec/specs/system-prompt-pipeline/spec.md`
