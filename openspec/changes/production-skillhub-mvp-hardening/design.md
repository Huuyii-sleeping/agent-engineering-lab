# 设计

## 生命周期锁

在 `SkillRegistryService` 内维护单进程互斥锁：

```ts
private lifecycleOperation: { skillId: string; action: SkillAuditAction } | null
```

下载、上传、安装、升级、回滚、卸载均通过同一个 guard 执行。若已有操作进行中，抛出 `SkillLifecycleConflictError`，controller 返回 409。

## Readiness API

新增：

```http
GET /api/skills/readiness
```

返回：

- registry 同步状态。
- store 是否可读。
- installed/updateAvailable/invalid/failedAudit 计数。
- overall status：`ready | degraded | blocked`。

## Package hash

`SkillStoreService` 在读取 builtin/custom/remote 本地包时计算 normalized package SHA-256，并放入 `StoredSkillPackage.packageSha256`。`SkillRegistryItem.packageSha256` 对本地条目不再为空。

## Web 接入

Web API 增加 `fetchSkillHubReadiness()`，`refreshSkills()` 并行读取 readiness。SkillHubPage 优先使用服务端 readiness 的状态和计数，未加载时回退现有本地聚合。

## 风险

- lifecycle lock 是单进程锁，适合当前本地/BFF 单实例生产可用 MVP；多实例部署仍需外部锁。
- readiness 的 store writable 只做轻量可读/状态校验，不做 destructive write probe。
