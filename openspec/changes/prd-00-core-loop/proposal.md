## Why

当前仓库已有全量 PRD，但实现需要从可验证、可交付的小范围开始。
本变更定义第一阶段切片：一个仅包含安全 `bash` 工具的最小 CLI Agent 循环。

## What Changes

- 新增最小 Agent 主循环：调用模型、执行工具调用、回填工具结果、持续迭代至收敛。
- 新增 `bash(command)` 工具：包含超时控制、危险命令拦截、输出截断。
- 新增 CLI 交互：固定提示符与标准退出命令。
- 明确排除文件工具、todo/task、subagent、skills、compact、team、worktree 等能力。

## Capabilities

### New Capabilities
- `core-agent-loop`: 提供单工具安全执行的最小 Agent 循环与 CLI 运行能力。

### Modified Capabilities
- 无。

## Impact

- 影响代码：TypeScript Agent 入口、主循环、工具执行与消息回填逻辑。
- 影响接口：OpenAI Chat Completions 调用参数与 tool 结果编排方式。
- 依赖影响：沿用现有 OpenAI 客户端与 shell 执行能力，无新增外部依赖。
- 系统影响：本地 CLI 执行流程与命令安全策略行为。
