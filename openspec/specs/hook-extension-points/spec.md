# hook-extension-points Specification

## Purpose
定义 Agent 的项目级 Hook 扩展点、命令型 hook 执行契约和结构化决策返回格式，使工具、会话与停止事件能够被可配置逻辑安全拦截或补充。
## Requirements
### Requirement: Agent SHALL provide a unified hook runner
系统 SHALL 提供统一 Hook 运行时，用于读取项目级 `.codex/hooks.json`、执行匹配到的命令型 hook，并归并固定事件面的处理结果。

#### Scenario: 执行已注册 Hook
- **WHEN** 某个事件面存在已注册 Hook
- **THEN** 系统按既定顺序执行处理器并返回结构化结果

### Requirement: Hook configuration MUST resemble Codex-style project hooks
系统 MUST 支持接近真实 Codex 的项目级 hook 配置形态，包括 `.codex/hooks.json`、事件名分组和可选 matcher。

#### Scenario: 读取项目级 hooks.json
- **WHEN** 工作区存在 `.codex/hooks.json`
- **THEN** 系统从该文件加载 hook 配置并在对应事件触发时生效

#### Scenario: matcher 过滤工具事件
- **WHEN** `PreToolUse` 或 `PostToolUse` 配置了工具 matcher
- **THEN** 仅匹配对应工具名的 hook 会被执行

### Requirement: Command hooks MUST use JSON stdin/stdout contract
命令型 hook MUST 通过标准输入接收事件 JSON，并通过标准输出返回结构化决策。

#### Scenario: hook 接收工具调用输入
- **WHEN** 系统触发一次 `PreToolUse`
- **THEN** 对应 hook 进程从标准输入接收到至少包含事件名、会话标识、工具名和工具参数的 JSON

#### Scenario: hook 返回阻止决策
- **WHEN** hook 进程返回结构化 block 决策
- **THEN** 系统终止当前动作并使用返回原因构造可读结果

### Requirement: Hook results MUST be structured and actionable
Hook 返回值 MUST 使用统一结构表达继续、阻止和注入补充消息，而不得依赖裸布尔值或异常语义混用。

#### Scenario: Hook 阻止当前动作
- **WHEN** `PreToolUse` Hook 返回阻止动作
- **THEN** 当前工具调用被终止，并返回结构化原因

#### Scenario: Hook 注入补充消息
- **WHEN** `PostToolUse` Hook 返回补充消息
- **THEN** 系统将该消息作为后续上下文的一部分注入主流程

### Requirement: QueryToolStage boundary corrections MUST preserve tool hook blocking and message injection semantics
QueryToolStage 边界校正 MUST 保持 PreToolUse / PostToolUse hook 阻断、补充消息注入和结构化工具输出语义不变。

#### Scenario: PreToolUse hook 阻断工具
- **WHEN** PreToolUse hook 返回 blocked
- **THEN** 系统继续不执行底层工具，并回填包含 `HOOK_BLOCKED` 的结构化 tool output

#### Scenario: hook 注入补充消息
- **WHEN** PreToolUse 或 PostToolUse hook 返回补充 messages
- **THEN** 系统继续将这些消息按原有位置追加为 system messages

#### Scenario: PostToolUse hook 接收工具结果
- **WHEN** 工具未被 PreToolUse 阻断并完成执行
- **THEN** PostToolUse hook 继续接收 tool name、arguments、output、ok 和 error code

### Requirement: QueryFinalization boundary corrections MUST preserve Stop hook payload and injection semantics
QueryFinalization 边界校正 MUST 保持 Stop hook payload 和补充 system message 注入语义不变。

#### Scenario: Stop hook 触发
- **WHEN** query round 收尾阶段运行 Stop hook
- **THEN** hook payload 继续包含 session id、trace id、round、outcome 和 tool call count

#### Scenario: Stop hook 注入消息
- **WHEN** Stop hook 返回补充 messages
- **THEN** 系统继续将这些消息作为 system messages 追加到会话历史
