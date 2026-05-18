# PRD-66 Tool Call 实现链路增强与执行重构

## 背景

本 PRD 对照 `liuup/claude-code-analysis` 的 `analysis/04b-tool-call-implementation.md`，只聚焦工具调用实现链路。当前仓库已经具备 builtin/MCP 工具目录、工具执行器、安全 gate、Hook、replay dry-run、结果分析和 OpenAI tool schema 暴露，但整体仍偏向“按名称分发 handler”。需要补齐工具协议元数据、输入校验、并发批处理、审计可解释性和坏输入的保守默认。

## 目标

- 工具注册不只是 OpenAI schema，还要包含执行元数据：只读/写入、风险等级、是否可并发、超时建议、来源。
- 工具执行前必须做 JSON 参数解析和 schema 子集校验，坏 JSON 或缺 required 参数不能静默变成 `{}`。
- Query loop 能按工具元数据将同一轮 tool calls 分成只读并发批和写入串行批，保证结果仍按原始 tool_call 顺序回填。
- 工具执行审计要能说明批次、并发模式、风险和阻塞原因。
- 保持现有安全 gate、Hook、replay dry-run、MCP 分发和 tool result 兼容。

## 当前缺口

- `parseToolArgs()` 对 malformed JSON 直接返回 `{}`，可能把坏输入伪装成空参数。
- 执行器没有依据 tool schema 做 required/type/enum 校验。
- `ToolRegistration` 缺少执行语义字段，目录只能回答“有哪些工具”，不能回答“能否并发/是否写入/风险如何”。
- 同一轮多个 tool call 当前串行执行，即使全是只读工具也无法并发。
- 并发执行需要保持 tool result message 顺序，否则会破坏模型 tool_call_id 对齐。
- replay-safe 只是执行期布尔值，目录元数据没有充分暴露风险/并发策略。

## 范围

In scope:
- JSON schema 子集校验：`required`、基础 `type`、`enum`、array items。
- 工具执行 profile：`readOnly`、`mutatesWorkspace`、`riskLevel`、`parallelSafe`、`timeoutMs`。
- builtin 工具 profile 的保守推断和手动覆盖。
- Tool service 暴露 `getToolRegistration(name)`，供执行器和 query stage 使用。
- Query tool stage 批处理：只读且 parallel-safe 的连续调用可并发；其他调用串行。
- 并发批结果按原始顺序追加 tool result messages。
- 单元测试覆盖坏 JSON、缺 required、并发批顺序、写入工具不并发。

Out of scope:
- 远端工具沙箱协议重写。
- 完整 JSON Schema validator 依赖。
- 工具取消/中断的跨进程实现。
- 供应商特定 tool protocol 的替换。

## 验收标准

- AC-1：malformed tool arguments 返回 `TOOL_INPUT_PARSE_ERROR`，不会执行 handler。
- AC-2：缺 required 参数或 enum/type 不匹配返回 `TOOL_INPUT_VALIDATION_ERROR`。
- AC-3：工具目录 metadata 展示 `readOnly`、`parallelSafe`、`riskLevel`、`mutatesWorkspace`。
- AC-4：同一轮多个只读 parallel-safe 工具可并发执行，并按原 tool_call 顺序追加 `role=tool` 消息。
- AC-5：任何写入/高风险/未知并发安全的工具仍串行执行。
- AC-6：已有安全 gate、Hook、replay dry-run、MCP 分发测试继续通过。

## 保留缺口

- 完整 JSON Schema draft 校验暂不引入第三方 validator。
- 跨进程取消、流式 tool result、供应商级 tool_use block 细节暂不重构。
- MCP 远端工具的并发安全默认保守处理，除非 registry 明确声明。
