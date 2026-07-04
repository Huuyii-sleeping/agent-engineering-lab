# production-skillhub-preflight-ui

## Why

`production-skillhub-runtime-preflight` 已经提供 BFF/Agent service 预检接口，但 Web 端还不能直接使用它。用户在 Agent 配置页只能看到 BFF 安装状态，无法知道 Agent runtime 是否真的能加载这些版本绑定。

本阶段把预检能力接到 Agent 配置页，让“保存前版本健康”和“运行时可加载”形成闭环。

## What Changes

- Web API client 新增 `resolveAgentSkills()`。
- Agent 配置页新增运行时预检状态面板。
- 用户可手动触发预检。
- 草稿变化后预检状态自动失效，避免显示旧结果。
- 预检失败展示第一条可读失败原因。

## Non-Goals

- 不阻止保存或测试。
- 不自动修复缺失 Skill。
- 不新增复杂轮询。
- 不改 Agent service/BFF 接口。

## Acceptance Criteria

- Web API client 能调用 `/api/agent-skills/resolve` 并标准化成功/失败结果。
- Agent 配置页展示未检查、检查中、成功、失败状态。
- 修改 Agent 草稿后清空旧预检结果。
- 单元测试覆盖 API 成功/失败和配置页状态展示。
