# production-skillhub-mvp-hardening

## Why

当前 SkillHub 已经完成核心 UI、生命周期、审计和 Agent 影响确认，但要达到“先生产可用”的标准，还需要把几个事故高发点收住：后端并发生命周期操作、可观测 readiness、以及本地 package hash 可见性。

本阶段完成生产可用 MVP 的最后收口。

## What Changes

- BFF 生命周期操作增加服务端互斥锁。
- BFF 暴露 SkillHub readiness API，返回 registry/store/audit/skill 计数。
- 本地 builtin/custom/downloaded package 返回可展示的 SHA-256 hash。
- Web 读取 BFF readiness，并优先展示服务端 readiness 状态。
- 补 BFF 和 Web 测试。

## Non-Goals

- 不实现完整签名体系。
- 不引入数据库迁移。
- 不做多用户权限系统。
- 不做远端推送或自动轮询。

## Acceptance Criteria

- 并发生命周期操作会被 BFF 拒绝为 busy。
- `GET /api/skills/readiness` 返回生产可用摘要。
- Web readiness 使用服务端摘要并保留现有 UI 展示。
- 本地 package 条目展示 hash。
- Web/BFF 测试和根级 build 通过。
