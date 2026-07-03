# production-skillhub-admin-security

## Why

第 1 阶段稳定了 Skill package v1，但 standalone registry 的 `/admin/publish` 仍是裸接口。只要 registry service 暴露到团队网络，任何人都能发布私有 skill，这不符合生产级 SkillHub 的最小安全要求。第 2 阶段需要先把 admin 写接口收口到 token 鉴权、publisher 管理和 audit log，为后续审核、签名、组织权限打基础。

## What Changes

- Registry service 新增 `SKILL_REGISTRY_ADMIN_TOKEN` 配置。
- `/admin/**` 写接口必须校验 bearer token。
- 增加 publisher 管理 API：
  - `GET /admin/publishers`
  - `POST /admin/publishers`
- 增加 audit API：
  - `GET /admin/audit-events`
- `/admin/publish` 写入 audit event。
- BFF 调用 registry service publish 时带 `SKILL_REGISTRY_ADMIN_TOKEN`。
- Docker Compose 增加 admin token 环境变量占位。

## Non-Goals

- 本阶段不实现用户登录、JWT、多租户组织权限和人工审核后台。
- 本阶段不实现包签名验签。
- 本阶段不改 Web UI；Web 上传仍通过 BFF，由 BFF 转发 admin token。

## Acceptance Criteria

- 未带 token 访问 `/admin/publish` 返回 `401`。
- token 错误返回 `403`。
- token 正确时 publish 成功并写入 audit event。
- 可通过 admin API 创建和列出 publisher。
- BFF 配置 registry service 时能带 token 发布 custom upload。
- 现有 public registry read/download API 不需要 token。
