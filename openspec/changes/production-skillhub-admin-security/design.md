# 设计

## Admin Token

Registry service 使用单个 bearer token 做第 2 阶段最小鉴权：

```text
Authorization: Bearer <SKILL_REGISTRY_ADMIN_TOKEN>
```

配置：

- `SKILL_REGISTRY_ADMIN_TOKEN`：生产部署必须显式提供。
- 本地开发默认使用 `local-dev-skill-registry-admin-token`，保证当前 Web/BFF 演示链路无需额外手工配置。

后续阶段可把单 token 替换为 publisher-scoped token 或登录态，但 HTTP 边界保持为 admin API。

## API

```text
GET  /admin/publishers
POST /admin/publishers
POST /admin/publish
GET  /admin/audit-events
```

所有 `/admin/**` 都需要 token。

`POST /admin/publishers` 请求体：

```json
{
  "id": "team-platform",
  "name": "Team Platform",
  "verified": true
}
```

`GET /admin/audit-events` 返回最近 audit events：

```json
{
  "events": [
    {
      "id": 1,
      "action": "skill.publish",
      "actor": "admin-token",
      "subject": "skill-id@1.0.0",
      "metadata": {},
      "createdAt": 123456789
    }
  ]
}
```

## 数据模型

`publishers` 表继续复用现有字段，新增 store 方法管理 publisher。

新增表：

```text
audit_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  subject TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```

## BFF 接入

BFF 新增 `SKILL_REGISTRY_ADMIN_TOKEN` 配置，默认值与 registry 本地开发默认值一致。`SkillStoreService.publishPackageToRegistry()` 调用 registry service `/admin/publish` 时带 bearer token。

## 风险与取舍

- 单 token 不是最终权限模型，但能立刻阻止裸写接口。
- 本地默认 token 仅用于开发便利，生产 Compose/部署必须覆盖。
- Audit log 先记录关键 admin 事件，不在本阶段做导出和告警。
