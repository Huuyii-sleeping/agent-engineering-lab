## Overview

本变更将子代理从“文本 worker”升级为“受限工具 worker”。核心实现为：抽离基础工具注册中心，子代理复用该中心执行 tool-calling 循环；并通过事件队列将完成状态反馈给主代理。

## Architecture

### 1) Base tool registry

- 新增 `src/tools/base.ts`：
- 提供 `BASE_TOOLS` 与 `runBaseToolByName`。
- 覆盖 `bash/read_file/write_file/edit_file/todo/task_*`。

### 2) Subagent execution loop

- `SubagentManager.execute` 改为多轮 tool-calling：
- 请求模型时注入 `BASE_TOOLS`。
- 处理每个 tool call 并把 `role: tool` 回填到子代理消息历史。
- 无 tool calls 时收敛并标记完成。

### 3) Completion notification queue

- `SubagentManager` 维护内存通知队列。
- 子代理 `completed/failed` 时写入通知事件。
- 主循环每轮开始前 `drainSubagentNotifications()` 并追加 system 消息。

## Safety

- 子代理白名单仅限基础工具，不包含 `subagent_*`，避免递归膨胀。
- 继续复用现有工具安全策略（如 bash 拦截、文件越界校验）。

## Compatibility

- `subagent_spawn/send/wait/list/close` 参数与返回结构保持兼容。
- 仅新增通知行为与真实工具执行副作用。
