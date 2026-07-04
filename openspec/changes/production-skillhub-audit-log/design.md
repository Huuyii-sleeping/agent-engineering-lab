# 设计

## BFF 状态模型

扩展 `SkillStoreState`：

```ts
type SkillAuditAction =
  | "download"
  | "upload"
  | "install"
  | "update"
  | "rollback"
  | "uninstall";

type SkillAuditEvent = {
  id: string;
  action: SkillAuditAction;
  skillId: string;
  skillName: string;
  version: string;
  status: SkillStatus;
  at: number;
};
```

审计事件保留最近 50 条，按时间倒序写入。

## BFF API

新增：

```text
GET /api/skills/audit
```

返回：

```json
{
  "ok": true,
  "events": []
}
```

## Web 展示

`App` 加载 SkillHub 时同步拉取审计事件，并在 Skill lifecycle 操作成功后刷新。

`SkillHubPage` 在详情面板中按当前 `skill.id` 过滤事件，展示最近 5 条。

## 风险

- 本阶段只有本地 BFF 审计，没有真实用户身份字段。
- 事件写入与 lifecycle 状态写入不是事务；如果审计写入失败会抛错，避免静默丢失。
