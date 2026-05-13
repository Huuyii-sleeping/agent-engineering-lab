## ADDED Requirements

### Requirement: QueryFinalization internals MUST separate round counter delivery finalizer stop hook and public facade boundaries
QueryFinalization 内部 MUST 区分 round counter、delivery finalizer、stop hook runner 与 public facade，使轮次状态、自动交付验证、停止扩展点和对外 API 可以独立演进。

#### Scenario: 调整轮次计数
- **WHEN** 系统调整 assistant-only 或 tool-driven round 的 `roundsWithoutTodo` 更新
- **THEN** 维护者主要修改 round counter 边界，而不是修改 delivery 或 stop hook 边界

#### Scenario: 调整自动交付验证收尾
- **WHEN** 系统调整 auto delivery 触发或摘要回填
- **THEN** 维护者主要修改 delivery finalizer 边界，而不是修改 Stop hook runner

#### Scenario: 读取 QueryFinalization public facade
- **WHEN** 维护者阅读 `runtime/query-finalization.ts`
- **THEN** 该文件主要表达 public finalization API，而不是直接承载 round counter、delivery 和 stop hook 的全部细节
