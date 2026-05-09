# PRD-14 Hook 系统与统一扩展点

## 目标

为 Agent 建立统一的事件扩展点，而不是把拦截、补充、审计逻辑散落在主循环和工具执行代码里。

## 范围（In Scope）

- Hook 事件模型：`event_name + payload + result`。
- `HookRunner`：统一注册、执行和结果归并。
- 最小事件面：
  - `SessionStart`
  - `PreToolUse`
  - `PostToolUse`
- 统一返回语义：
  - `0`：正常继续
  - `1`：阻止当前动作
  - `2`：注入补充消息后继续

## 非目标（Out of Scope）

- 一次性实现几十种 hook 事件。
- 完整第三方插件市场。

## 功能要求

- Hook 不直接改写主循环，而是在固定时机由主循环发起调用。
- `PreToolUse` 支持拦截工具执行。
- `PostToolUse` 支持补充说明或日志写回。
- Hook 执行结果必须结构化，避免布尔值/字符串/异常混用。
- 后续安全、观测、恢复能力可通过 hook 继续扩展，而不是重复侵入主循环。

## 验收标准（AC）

- AC-14-1：主循环可在固定时机触发 hook，而不改变既有主流程结构。
- AC-14-2：`PreToolUse` 可阻止一次工具执行并返回可读原因。
- AC-14-3：`PostToolUse` 可在工具执行后补充一条说明消息。
- AC-14-4：新增 hook 处理器时，无需修改主循环核心分支。

## 实施顺序

1. 先实现 `HookRunner` 与统一返回结构。
2. 再接入 `SessionStart / PreToolUse / PostToolUse`。
3. 最后把现有安全/观测逻辑中适合抽象的部分迁入 hook 机制。
