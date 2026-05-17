## ADDED Requirements

### Requirement: Memory runtime MUST support disabling automatic extraction and injection
memory 运行时 MUST 支持独立关闭自动抽取与自动注入，使用户可以阻断“从输入自动沉淀记忆”与“从本地记忆自动回流进模型请求”这两条默认路径，而不是只能在工件写入后再补救。

#### Scenario: Auto extraction is disabled
- **WHEN** 用户启用 `memory.manual_only`、`memory.disabled` 或等价隐私姿态
- **THEN** 系统不再根据普通用户输入自动抽取新 memory
- **AND** 只有显式 `memory_add` 或等价显式操作才允许新增 memory

#### Scenario: Auto injection is disabled
- **WHEN** 用户启用 no-inject、manual-only 或等价隐私姿态
- **THEN** 系统不再自动将 `memory_context` 注入模型请求
- **AND** prompt inspection / governance surface 能说明该数据类别已被抑制

### Requirement: Memory minimization posture MUST remain honest about unsupported team sync
即使本地 memory 支持关闭或最小化，系统也 MUST 继续将 shared team memory / memory sync 标记为 `reserved_gap` 或 `未支持`，不得把“本地 memory 已可关闭”误写成“团队记忆隐私能力已完整支持”。

#### Scenario: User inspects memory privacy capabilities
- **WHEN** 用户检查 memory 相关隐私控制
- **THEN** 系统区分本地 memory 最小化控制与团队级 memory sync 缺口
- **AND** 不将二者混为同一个能力状态
