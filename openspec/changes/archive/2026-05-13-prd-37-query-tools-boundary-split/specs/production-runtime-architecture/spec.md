## ADDED Requirements

### Requirement: QueryToolStage internals MUST separate hooks executor task sync and stage orchestration boundaries
QueryToolStage 内部 MUST 区分 hooks、executor、task sync 与 stage orchestration，使 hook 扩展点、单次工具执行、任务联动和阶段遍历可以独立演进。

#### Scenario: 调整工具 hook 行为
- **WHEN** 系统调整 PreToolUse / PostToolUse 调用或 hook blocked output
- **THEN** 维护者主要修改 query tool hooks 边界，而不是修改 task sync 或 stage orchestration

#### Scenario: 调整单次工具执行
- **WHEN** 系统调整 tool_call / tool_result observability、execution context 或 security blocked event
- **THEN** 维护者主要修改 query tool executor 边界，而不是修改 hooks 或 task sync

#### Scenario: 读取 QueryToolStage orchestration
- **WHEN** 维护者阅读 `runtime/query-tools.ts`
- **THEN** 该文件主要表达 tool calls 遍历与阶段编排，而不是直接承载 hook、executor 和 task sync 的全部细节
