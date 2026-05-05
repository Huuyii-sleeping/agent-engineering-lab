## Overview

PRD-06 引入两个核心模块：`AutonomyManager` 与 `WorktreeManager`。前者负责 idle 轮询和任务认领，后者负责隔离工作目录与生命周期事件记录。

## Autonomy

- 轮询间隔：5000ms。
- 空闲超时：60000ms。
- `scanUnclaimedTasks`: 读取待处理任务。
- `claimTask`: 通过本地串行锁避免并发重复认领。
- 状态机：`idle -> claiming -> working -> idle|shutdown`。

## WorktreeManager

- 名称校验：`[A-Za-z0-9._-]{1,40}`。
- 能力：
  - create
  - list/status
  - run command
  - keep
  - remove
- 非 git 仓库时回退到 `WORKDIR/.worktrees/<name>` 目录策略。

## EventBus

- `.worktrees/events.jsonl`: 事件流。
- `.worktrees/index.json`: 当前工作树索引。
- 每个生命周期动作都记录事件，便于审计。

## Task binding

- 在任务模型新增 `worktree` 字段。
- 支持绑定/解绑任务与工作树。
