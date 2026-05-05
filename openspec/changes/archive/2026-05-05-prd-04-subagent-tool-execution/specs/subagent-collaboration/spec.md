## MODIFIED Requirements

### Requirement: Subagent MUST run without tool privileges
原“仅文本推理”更新为“受限工具推理”：子代理 MUST 仅可使用基础工具白名单，不得获得完整主代理权限。

#### Scenario: 可执行基础工具
- **WHEN** 子代理接收到需要文件落盘或命令执行的任务
- **THEN** 子代理可通过基础工具完成任务并返回真实执行结果

#### Scenario: 禁止递归子代理工具
- **WHEN** 子代理尝试调用 `subagent_*` 能力
- **THEN** 系统拒绝该能力，不向其注入相关工具定义
