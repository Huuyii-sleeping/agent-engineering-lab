## Why

PRD-00 ~ PRD-06 已经覆盖了核心能力，但当前实现仍存在一些工程化短板：默认常量分散、部分状态流转缺少保护、持久化数据缺少版本标识、回归验证入口不统一。这些问题会放大后续 PRD 的实施风险，需要在继续新增能力前先做稳定性加固。

## What Changes

- 新增统一运行时配置层，收敛超时、阈值、输出截断等常量并支持环境变量覆盖。
- 对任务/自治/团队/工作树等关键路径补充状态机保护与错误码一致性。
- 为核心持久化结构引入 `schemaVersion`，并支持旧数据兼容读取。
- 增加一键回归测试入口，覆盖关键成功/失败场景。

## In Scope

- `runtime-config` 统一配置入口。
- `task/team/worktree` schema version 演进与兼容。
- 关键状态转移与失败码补强。
- 回归测试脚本与说明文档补齐。

## Out of Scope

- 新的跨域产品能力（如复杂调度中心、商业化计费）。
- 外部平台大规模集成。
- 完整端到端云环境压测体系。

## Capabilities

### New Capabilities
- `agent-stability-hardening`: 统一配置、状态机守卫、schema 演进、回归测试入口。

### Modified Capabilities
- `core-agent-loop`
- `task-visualization-persistence`
- `team-communication-protocol`
- `autonomy-worktree-isolation`（通过运行时常量与状态约束补强）

## Impact

- 代码影响：`from-scratch-agent/src/tools/*`、`src/config/runtime`、测试脚本与 README。
- 数据影响：`.tasks/.team/.worktrees` 新增或补齐 `schemaVersion` 字段。
- 流程影响：提交前可执行统一回归入口提升发布稳定性。
