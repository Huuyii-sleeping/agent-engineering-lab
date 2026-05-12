## ADDED Requirements

### Requirement: Security tool internals MUST separate policy approval manager and tool facade boundaries
Security 工具内部 MUST 区分 policy 规则评估、approval 持久化、manager 编排与 tool facade，使安全策略、审批状态和工具对外契约可以独立演进。

#### Scenario: 调整安全策略规则
- **WHEN** 系统调整默认 policy、policy merge 或 rule match 逻辑
- **THEN** 维护者主要修改 security policy 边界，而不是修改 approval store 或 tool facade

#### Scenario: 调整 approval 持久化
- **WHEN** 系统调整 approval 文件读取、归一化或保存逻辑
- **THEN** 维护者主要修改 approval store 边界，而不是修改 policy evaluate 或 tool schemas

#### Scenario: 读取 security public facade
- **WHEN** 维护者阅读 `tools/security.ts`
- **THEN** 该文件主要表达 security tool schema 与 public handlers，而不是直接承载 policy、approval store 和 gate 编排的全部细节
