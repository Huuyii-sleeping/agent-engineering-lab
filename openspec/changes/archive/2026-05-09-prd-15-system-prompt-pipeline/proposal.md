## Why

当前 `apps/agent-cli` 的 system 输入来源是分散的：基础 system prompt 在 `config.ts` 中硬编码，memory 注入、通知类 reminder、hooks 追加消息和临时上下文分散在 `agent-loop.ts` 等多个位置。随着 hooks、memory、observability 和后续外部能力继续增加，这种“边做边拼”的方式已经很难维护，也不利于测试 prompt 组装边界。

PRD-15 需要先把 prompt 组装链路收敛为稳定的流水线，明确稳定规则与动态上下文的边界，为后续的错误恢复、调度注入和 MCP 能力接入提供统一入口。

## What Changes

- 新增 `SystemPromptBuilder`，统一组装主 `system prompt` 与动态 system sections。
- 将当前分散的 system 输入来源拆分为明确的 section：`core`、`tools`、`skills`、`memory`、长期规则、动态上下文。
- 明确“稳定规则”与“动态提醒”边界，避免所有内容继续堆叠进单一字符串或散落在主循环各处。
- 让 memory、skills、长期规则和运行时动态上下文都通过统一组装链路进入最终模型输入。
- 补充针对 prompt sections 和最终组装结果的验证与回归测试。

## Capabilities

### New Capabilities

- `system-prompt-pipeline`: 定义 system prompt 的 section 化组装、来源边界和最终注入契约。

### Modified Capabilities

- `core-agent-loop`: 主循环的模型请求前置输入从“直接拼接 system/reminder”调整为“通过统一 prompt builder 生成并注入”。

## Impact

- 影响代码：
  - `apps/agent-cli/src/config.ts`
  - `apps/agent-cli/src/agent-loop.ts`
  - 可能新增 `apps/agent-cli/src/prompt/*` 或等效模块
  - memory 注入与 hooks 输出接入边界
- 影响测试：
  - 新增 prompt builder 单测
  - 调整相关 smoke / regression 用例
- 不涉及对外 API 破坏性变化，但会重构内部模型输入组装路径。
