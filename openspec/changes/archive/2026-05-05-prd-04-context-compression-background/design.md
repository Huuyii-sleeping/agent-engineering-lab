## Overview

本变更分两块实现：上下文压缩与后台任务。两者都通过“通知注入”接入主循环，保持与现有 subagent 通知机制一致。

## Context compression

- 估算：`Math.ceil(totalChars / 4)`。
- 阈值：`50000`（可后续参数化）。
- 手动压缩：`compact` 工具直接执行压缩。
- 自动压缩：每轮请求前估算，超阈值则自动触发。
- 快照：压缩前将当前 messages 序列以 JSONL 写入 `.transcripts/transcript_<ts>.jsonl`。
- 压缩策略：保留 system、最近 N 条原始消息，并插入一条压缩摘要消息。

## Background tasks

- `background_run(command)`：异步执行，立即返回 taskId。
- `check_background(task_id?)`：查单个任务或列全部。
- 状态：`running/completed/failed`，记录 `stdout/stderr/exitCode`。
- 通知：任务完成/失败时入队，主循环下一轮注入。

## Main loop integration

- 每轮开始前：
  - 处理 subagent 通知
  - 处理 background 通知
  - 估算 token 并按需自动压缩
- 保持现有 tool-calling 契约不变。
