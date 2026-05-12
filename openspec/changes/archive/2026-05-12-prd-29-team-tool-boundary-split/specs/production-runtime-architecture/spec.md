## ADDED Requirements

### Requirement: Team tool internals MUST separate store protocol manager and tool facade boundaries
Team 工具内部 MUST 区分 team store、protocol 语义、manager 编排与 tool facade，使消息投递、协议请求和对外契约可以独立演进。

#### Scenario: 调整团队持久化
- **WHEN** 系统调整 teammates / requests 读取、归一化或保存逻辑
- **THEN** 维护者主要修改 team store 边界，而不是修改 protocol 语义或 tool schemas

#### Scenario: 调整 team protocol 语义
- **WHEN** 系统调整 request_id、pending/approved/rejected 流转或消息构造
- **THEN** 维护者主要修改 team protocol 边界，而不是修改 store 或 tool facade

#### Scenario: 读取 team public facade
- **WHEN** 维护者阅读 `tools/team.ts`
- **THEN** 该文件主要表达 team tool schema 与 public handlers，而不是直接承载 store、protocol 和流程编排的全部细节
