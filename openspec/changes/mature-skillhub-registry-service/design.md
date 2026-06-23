# 设计

## 总体架构

```text
apps/web-console
  -> apps/bff
    -> RegistryProvider
      -> Skill Registry Service (Docker, port 3190)
        -> /data/registry.sqlite
        -> /data/packages
```

## Docker 数据目录

宿主机挂载目录：

```text
runtime/skill-registry/
├── registry.sqlite
├── packages/
└── logs/
```

容器内路径：

```text
/data/registry.sqlite
/data/packages
```

## Skill Registry Service

新增 workspace package：`apps/skill-registry`。

服务使用 Node HTTP server，避免引入额外框架。SQLite 使用同步访问封装在 store 层，controller 保持薄适配。

### 数据表

```text
publishers(id, name, verified)
skills(id, name, summary, description, category, provider, runtime, permissions_json, tags_json, entry, maturity, created_at, updated_at)
skill_versions(skill_id, version, package_sha256, source, deprecated, rating, package_path, manifest_json, created_at, updated_at)
download_events(id, skill_id, version, created_at)
```

第一阶段下载量从 `download_events` 聚合得到；示例导入时可以写入 seed download events 或直接用 `initial_downloads` 字段。为了简单和可追踪，第一阶段用 `download_count` 字段存储累计下载量，后续再升级为事件聚合。

### API

```text
GET  /health
GET  /skills
GET  /skills/:id
GET  /skills/:id/versions
POST /skills/:id/download
POST /admin/seed
```

`GET /skills` 返回与当前 BFF remote registry 兼容的 index：

```json
{
  "skills": [
    {
      "id": "remote-prd-review",
      "version": "1.0.0",
      "packageUrl": "http://127.0.0.1:3190/skills/remote-prd-review/download",
      "packageSha256": "...",
      "source": "official",
      "publisher": { "id": "agent-lab", "name": "Agent Lab", "verified": true },
      "downloads": 12830,
      "rating": 4.8,
      "deprecated": false,
      "metadata": {}
    }
  ]
}
```

`POST /skills/:id/download` 返回 JSON package，并增加下载计数。

## BFF Provider 接入

BFF 新增配置：

```text
SKILL_REGISTRY_SERVICE_URL=http://127.0.0.1:3190
```

如果配置存在：

- `readRemoteRegistry()` 从 `${url}/skills` 读取 index。
- `readRemotePackage()` 对 registry service 的 download URL 使用 `POST`，其他 URL 仍使用 `GET`。

如果配置不存在，保留当前 static JSON registry 行为。

## 迁移策略

1. 先新增 registry service 和 Docker Compose，不改变默认行为。
2. BFF 增加 provider URL 配置后，用户可手动切换。
3. 后续再把 Web 的 Remote Registry 设置降级为 Registry Settings，并默认使用 service。
