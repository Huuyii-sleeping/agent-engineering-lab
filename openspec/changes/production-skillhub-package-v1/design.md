# 设计

## 包协议

第一阶段继续使用 JSON transport，避免引入 zip/tar 解包风险。生产包 v1 的最小结构：

```json
{
  "skillPackageVersion": "1.0",
  "files": [
    { "path": "SKILL.md", "content": "..." },
    { "path": "skill.json", "content": "..." },
    { "path": "README.md", "content": "..." },
    { "path": "permissions.json", "content": "{...}" },
    { "path": "examples/basic.md", "content": "..." }
  ]
}
```

兼容策略：

- 缺少 `skillPackageVersion` 时视为 legacy package。
- legacy package 仍必须包含 `SKILL.md` 和 `skill.json`。
- v1 package 额外启用版本字段和权限声明校验。

## 校验规则

基础规则：

- 最多 32 个文件。
- 单文件最大 128KB。
- 文件路径不得为空、绝对路径、包含反斜杠、包含空段或 `..`。
- 禁止 `scripts/**`。
- 文件路径必须唯一。
- 必须包含 `SKILL.md` 和 `skill.json`。

v1 权限声明：

- `permissions.json` 可选。
- 存在时必须是 JSON object。
- `permissions.json.permissions` 必须是 string array。
- `permissions.json.permissions` 必须覆盖 `skill.json.permissions` 中声明的权限，避免 UI 展示与包权限声明分裂。

## 代码边界

- `apps/skill-registry/src/package-validator.ts`：registry publish 和 seed 的包校验。
- `apps/bff/src/skills/skill-validator.service.ts`：BFF 上传、下载、安装前校验。
- `apps/skill-registry/src/types.ts` 与 `apps/bff/src/skills/skill-types.ts`：补充 package version 类型。

当前两端 validator 仍各自存在，本阶段先保证行为一致；后续如抽 workspace 共享包，再把校验逻辑沉淀到共享模块。

## 风险与取舍

- 暂不引入 zip/tar，减少解包、路径穿越和文件类型处理复杂度。
- 暂不强制要求 v1 package 必须带 `permissions.json`，避免一次性破坏现有 registry 示例和上传体验。
- 包签名放到下一阶段之后，因为签名依赖稳定 package raw canonicalization 和发布者身份模型。
