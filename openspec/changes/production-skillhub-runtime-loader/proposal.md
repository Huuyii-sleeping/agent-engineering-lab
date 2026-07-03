# production-skillhub-runtime-loader

## Why

`production-skillhub-runtime-binding` 已经让 Web/BFF/Agent service 能传递并持久化 Agent 的版本化 Skill 绑定，但运行时仍按当前本地 skill roots 和 `AGENT_SKILLS` 全局配置加载 skill。

这会留下两个生产风险：

- Agent 绑定了某个版本的 Skill，但运行时可能加载到另一个同名本地 Skill。
- 绑定 Skill 缺失、版本不存在或 package 损坏时，运行时无法在执行前明确失败。

本阶段要把 Agent context 从“可见元数据”推进成“真实运行约束”：当 session 带有 Agent Skill 绑定时，Agent service 必须按绑定解析本地 SkillHub package，并把精确版本注入本轮 prompt。

## What Changes

- Agent CLI 增加 SkillHub package root 配置，支持 `AGENT_SKILLHUB_ROOTS`。
- Skill loader 支持按 `skillId + version + sourceType + registrySource` 解析绑定 Skill。
- Agent service 在 chat 执行前基于 session agent context 构建本轮 promptSource。
- 绑定缺失、版本不存在或读取失败时，chat 返回结构化错误，不进入 query runtime。
- list/load skill 工具继续保留当前全局 catalog 行为；本阶段只约束带 Agent context 的 chat prompt 注入。

## Non-Goals

- 本阶段不实现权限弹窗或运行时权限审批。
- 本阶段不实现远端按需下载；Skill 必须已经存在于本地 SkillHub package root。
- 本阶段不改变 BFF SkillHub 安装 API 的用户体验。
- 本阶段不做复杂多租户隔离。

## Acceptance Criteria

- 带 Agent context 的 chat 只注入绑定版本 Skill。
- 绑定 Skill 缺失时，Agent service 返回 `AGENT_SKILL_LOAD_FAILED`。
- 绑定 Skill 版本不存在时，Agent service 返回 `AGENT_SKILL_LOAD_FAILED`，并说明缺失的 binding。
- 无 Agent context 的 chat 继续沿用当前全局 promptSource 行为。
- agent-cli 单元测试和 service session harness 覆盖成功加载、缺失失败和无 Agent fallback。
