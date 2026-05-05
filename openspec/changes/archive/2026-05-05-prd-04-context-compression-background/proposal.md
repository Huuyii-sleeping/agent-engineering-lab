## Why

当前 PRD-04 前半段已完成子代理工具执行与回流通知，但原始 PRD-04 还要求“上下文压缩 + 后台任务”以支撑长会话稳定运行。需要在同一 PRD-04 序列中补齐剩余能力，避免长历史导致上下文膨胀和长耗时命令阻塞主循环。

## What Changes

- 新增上下文压缩机制：`estimate_tokens`、`compact`，并在阈值超限时触发自动压缩。
- 新增转录快照落盘：压缩前保存 `.transcripts/transcript_<ts>.jsonl`。
- 新增后台任务能力：`background_run`、`check_background`，支持异步运行命令并回流完成通知。
- 保持现有工具与子代理能力兼容，不回归已通过验证的功能。

## In Scope

- 会话消息 token 近似估算（chars/4）。
- 手动与自动压缩流程。
- 后台任务启动、查询、完成通知注入主循环。

## Out of Scope

- 分布式任务调度与持久化队列。
- 压缩语义质量评估与多模型压缩链。
- 团队协作协议与 worktree 管理。

## Capabilities

### New Capabilities
- `context-compression`: 支持会话压缩、阈值触发与压缩前快照。
- `background-task-runtime`: 支持后台命令异步执行与状态查询。

### Modified Capabilities
- `core-agent-loop`: 新增自动压缩与后台通知注入行为。

## Impact

- 影响代码：`agent-loop`、`cli/runtime`、`tools` 扩展。
- 影响接口：新增 4 个工具调用能力（estimate/compact/background/check）。
- 系统影响：新增 `.transcripts/` 文件夹与后台任务内存状态。
