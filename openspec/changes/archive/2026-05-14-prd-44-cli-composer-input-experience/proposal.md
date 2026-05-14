## Why

PRD-43 已经把 CLI/TUI 的状态面、权限面、成本面、审批面补齐，但输入体验仍然明显偏原型：一行输入即发给模型，没有本地草稿、预览、取消和多行输入闭环。

这类问题不会通过继续补状态面解决，必须引入 composer 输入层。它是终端 Agent 从“能控制”走向“真能写复杂请求”的下一块基础产品面。

## What Changes

- 新增 PRD-44。
- 新增本地 composer 状态管理，支持多行草稿。
- 增加 `/compose`、`/preview`、`/send`、`/cancel`。
- CLI / TUI 进入草稿模式后，普通输入改为追加到草稿，而不是直接请求模型。
- 更新 prompt / footer / help，让用户清楚当前 draft 状态。
- 增加 focused tests。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - 新增 composer 状态模块
- 影响文档：
  - 新增 `PRD-44`
  - 新增 OpenSpec change
