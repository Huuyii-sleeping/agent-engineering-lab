## MODIFIED Requirements

### Requirement: Agent loop SHALL inject relevant memory before model request
主循环在每轮模型请求前 SHALL 基于最新用户输入注入相关记忆上下文，并通过统一的 system prompt 组装流水线将该上下文作为补充 system message 注入，且保持原有工具调用契约不变。

#### Scenario: 命中记忆时通过 prompt pipeline 注入上下文
- **WHEN** 最新用户输入可命中记忆条目
- **THEN** 主循环在发起模型请求前通过 prompt pipeline 追加 `memory_context` system message

## ADDED Requirements

### Requirement: Agent loop SHALL build system input through prompt pipeline
主循环在每轮模型请求前 SHALL 通过统一 prompt pipeline 构建模型 system 输入，而不是直接在多个模块中分别拼接稳定规则、动态提醒和运行时通知。

#### Scenario: 发起请求前统一构建 system 输入
- **WHEN** 主循环准备发起新的模型请求
- **THEN** 主循环先调用 prompt pipeline 获取 system 输入，再与历史消息拼装最终请求
