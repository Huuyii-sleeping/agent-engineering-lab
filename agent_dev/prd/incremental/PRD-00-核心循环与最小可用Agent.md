# PRD-00 核心循环与最小可用 Agent

## 目标

实现一个可在 CLI 中运行的最小 Agent，完成“模型回复 -> 工具调用 -> 回填结果 -> 继续循环”。

## 范围（In Scope）

- `runBash(command)`：执行 shell，支持超时与危险命令拦截。
- `toAssistantMessage(message)`：兼容 tool_calls 的消息转换。
- `agentLoop(messages)`：完整循环。
- CLI 入口：提示符、退出命令（`q/exit/空输入`）。

## 非目标（Out of Scope）

- 文件工具（读写改）。
- todo、task、subagent、skills、compact、team、worktree。

## 功能要求

- 仅暴露一个工具：`bash(command)`。
- 默认超时 120s，输出限制 50,000 字符。
- 拦截危险关键字：`rm -rf /`、`sudo`、`shutdown`、`reboot`。

## 验收标准（AC）

- AC-00-1：无 `tool_calls` 时，Agent 正常结束本轮。
- AC-00-2：有 `tool_calls` 时，能执行 `bash` 并回填 `role: tool`。
- AC-00-3：危险命令被拒绝并返回可读错误。
- AC-00-4：CLI 可连续多轮对话，输入退出指令可安全退出。

## 实施顺序

1. 先写 `runBash` 与安全拦截。
2. 再写 `agentLoop` 与 `toAssistantMessage`。
3. 最后接 CLI 入口并做交互测试。

