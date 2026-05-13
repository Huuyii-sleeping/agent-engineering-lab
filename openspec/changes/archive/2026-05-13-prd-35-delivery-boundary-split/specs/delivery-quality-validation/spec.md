## ADDED Requirements

### Requirement: Delivery boundary corrections MUST preserve stage failure retry and report semantics
Delivery 边界校正 MUST 保持 stage plan、失败分类、retry 和 report JSON shape 的现有语义不变。

#### Scenario: 构建交付验证计划
- **WHEN** 系统根据 root 和 `apps/agent-cli` package scripts 构建验证计划
- **THEN** 阶段顺序、命令和 skip 条件与边界拆分前保持一致

#### Scenario: 执行阶段失败
- **WHEN** 某个验证阶段失败、超时或遇到瞬时执行失败
- **THEN** 系统继续返回相同的 failure code、suggestion、attempts 与 retry 行为

#### Scenario: 写入交付报告
- **WHEN** 验证完成后生成 `.delivery/delivery_report.json`
- **THEN** report schemaVersion、summary、stages、latestFailure、risks 和 suggestions shape 与边界拆分前保持一致
