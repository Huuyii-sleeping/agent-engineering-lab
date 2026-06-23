# 设计

## Publish API

新增：

```text
POST /admin/publish
```

请求：

```json
{
  "package": {
    "files": [
      { "path": "SKILL.md", "content": "..." },
      { "path": "skill.json", "content": "{...}" }
    ]
  },
  "source": "private",
  "publisher": {
    "id": "local-user",
    "name": "Local User",
    "verified": false
  },
  "rating": null,
  "deprecated": false
}
```

响应：

```json
{
  "ok": true,
  "skill": {
    "id": "custom-review",
    "version": "0.1.0",
    "packageSha256": "...",
    "source": "private",
    "publisher": {}
  }
}
```

## 校验规则

第一阶段复用当前 SkillHub 上传边界：

- 必须包含 `SKILL.md` 和 `skill.json`。
- `skill.json` 必须包含 `id`、`name`、`version`。
- `id` 只能是小写字母、数字、短横线。
- 文件路径不能包含 `..`、绝对路径、反斜杠或空段。
- 单个 package 最多 32 个文件。
- 单文件最大 128KB。
- 禁止 `scripts/`。

## BFF 行为

当 `SkillStoreService` 配置了 `registryServiceUrl`：

- `uploadCustomSkill` 调用 registry service `POST /admin/publish`。
- 成功后继续把该 skill 作为远端 registry skill 展示和下载。
- BFF 本地 custom store 作为 fallback 保留，仅在未配置 registry service 时使用。

## 风险

- `/admin/publish` 第一阶段没有鉴权，只适合本地 Docker 使用。
- 后续必须增加 publisher auth、审核状态、签名和权限审批。
