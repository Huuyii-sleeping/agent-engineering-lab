## Why

PRD-41/42 已经补齐多入口、TUI 底座、Bridge 和 MCP 管理面。下一步对当前 CLI 工具最有价值的产品化方向，不是继续扩架构，而是让用户第一次打开、持续使用、遇到错误、完成任务时都更顺手、更清晰、更美观。

本轮把 CLI 当作主产品表面来打磨：统一视觉语言、命令发现、配置向导、运行状态、工具调用呈现、错误恢复和交付摘要。

## What Changes

- 新增 CLI 产品化体验 PRD。
- 设计默认交互 CLI 与 TUI 的统一视觉系统：标题区、状态栏、分组输出、色彩语义、紧凑布局。
- 增加 onboarding/config doctor 能力：检测模型、环境变量、workspace、MCP、hooks、权限与常见问题。
- 对齐 Claude Code 的高频控制面：`/model`、`/permissions`、`/cost|/usage`、`/compact`、`/add-dir`、`!<cmd>`。
- 增加命令发现与 slash command 体系：`/help`、`/status`、`/config`、`/tools`、`/sessions`、`/doctor`、`/theme`、`/clear`、`/redraw`。
- 增加工具调用和任务进度的产品化展示：tool preview、running/done/failed 状态、耗时、风险提示和结果折叠。
- 增加多 workspace root、权限模式和成本摘要，让 CLI/TUI 成为真正的运行控制面。
- 增加 session summary / closeout：本轮改动、验证命令、风险、后续建议。

## In Scope

- 当前 `agent-cli` 交互 CLI 和 TUI 的体验打磨。
- 零依赖或轻依赖优先，避免把产品化绑定到复杂 UI 框架。
- 重点覆盖本地开发者使用：启动、提问、执行工具、查看状态、配置修复、任务完成。
- focused tests 覆盖 renderer、command parsing、doctor checks、error formatting。

## Out of Scope

- 不做浏览器 Web Console。
- 不做公网 Bridge、账号体系或多租户。
- 不做完整主题市场或插件商城。
- 不改变 QueryEngine、工具执行、安全审批核心语义。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/entrypoints/cli-dispatcher.ts`
  - `apps/agent-cli/src/services/*`
  - 新增 CLI UI / doctor / slash command helpers
  - focused tests
- 影响文档：
  - 新增 `PRD-43`
  - 新增 OpenSpec change
