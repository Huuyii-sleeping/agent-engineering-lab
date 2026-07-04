# production-skillhub-runtime-preflight

## Why

Agent runtime 已经会在 chat 前强制加载版本绑定 Skill，但失败只会发生在用户发送消息时。生产级 SkillHub 需要一个更早、更便宜的诊断入口，让 Web/BFF 可以在创建 session、保存 Agent 或点击测试前确认绑定 Skill 是否能被 Agent service 真实加载。

## What Changes

- Agent service 增加 Skill 绑定预检能力。
- 新增 `POST /skills/resolve`，接收 Agent runtime context。
- BFF 增加代理接口 `POST /api/agent-skills/resolve`。
- 预检复用 runtime loader，失败返回 `AGENT_SKILL_LOAD_FAILED` 与结构化 details。
- 预检成功只返回安全摘要，不返回完整 Skill prompt 内容。

## Non-Goals

- 不自动下载缺失 Skill。
- 不改变 chat 执行路径。
- 不做 Web UI 展示。
- 不做权限审批或签名校验。

## Acceptance Criteria

- 有效绑定返回 `ok: true` 和已解析 Skill 摘要。
- 缺失绑定返回 `AGENT_SKILL_LOAD_FAILED`。
- 无效 Agent context 返回 `INVALID_AGENT_CONTEXT`。
- BFF 能代理预检请求并保留上游状态码与错误结构。
