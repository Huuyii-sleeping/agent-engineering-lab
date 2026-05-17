## ADDED Requirements

### Requirement: Prompt inspection surfaces MUST disclose model-input categories and inclusion reasons
任何 prompt inspection 或等价治理 surface MUST 能解释当前模型请求可能接触到的上下文类别及其 inclusion reason，至少覆盖用户输入、历史对话、工具结果、memory 注入、compact 摘要、附件、MCP 返回内容与动态运行时提醒。

#### Scenario: User inspects model-input categories
- **WHEN** 用户检查当前模型输入的数据类别
- **THEN** 系统列出各类别是否参与本轮模型请求
- **AND** 说明每一类进入模型的原因，而不要求用户直接阅读完整 prompt 正文

#### Scenario: Default inspection avoids raw context leakage
- **WHEN** 用户以默认模式检查模型输入治理信息
- **THEN** 系统优先展示类别、来源与状态摘要
- **AND** 不因为解释数据来源而直接暴露完整源码片段、完整 transcript 或其他高敏感正文
