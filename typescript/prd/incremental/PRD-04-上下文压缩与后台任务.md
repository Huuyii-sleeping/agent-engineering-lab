# PRD-04 上下文压缩与后台任务

## 目标

让 Agent 在长会话下可持续运行，并且能异步处理长耗时命令。

## 范围（In Scope）

- `estimateTokens/microCompact/autoCompact/compact`（对应 S06）。
- `BackgroundManager` + `background_run/check_background`（对应 S08）。

## 非目标（Out of Scope）

- 团队协作协议、自治认领、worktree。

## 功能要求

- 令牌估算使用字符/4 近似。
- `THRESHOLD=50000`，超阈值触发自动压缩。
- 压缩前落盘 `.transcripts/transcript_<ts>.jsonl`。
- `read_file` 结果默认保留不压缩。
- `background_run` 立即返回 taskId，不阻塞主循环。
- 主循环前可注入后台完成通知。

## 验收标准（AC）

- AC-04-1：长会话触发自动压缩且上下文连续。
- AC-04-2：手动 `compact` 可用。
- AC-04-3：后台任务可启动、查询、回流结果。

## 实施顺序

1. 先实现压缩（微压缩 -> 自动压缩）。
2. 再实现 `BackgroundManager`。
3. 在主循环中注入后台通知并联调。

