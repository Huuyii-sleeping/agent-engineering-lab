# 设计

## 数据来源

复用 Web 已有数据：

- `skills`: 计算总量、已安装数、可升级数。
- `auditEvents`: 计算失败事件数。
- `registrySettings`: 来自 `syncSkillRegistry()` 返回值。

## UI

在 SkillHub hero 下方新增 `Hub readiness` 条：

```text
Hub readiness
Registry synced / Needs attention / Waiting for sync
已安装 N
可升级 N
失败事件 N
```

## 状态规则

- `registrySettings === null`：等待同步。
- `registrySettings.lastSyncError` 非空：需要关注。
- 否则：Registry synced。

## 风险

- 当前 `refreshSkills()` 会主动 sync registry；如果 sync 失败，页面仍沿用既有错误处理。
- 失败事件数量来自本地已加载 audit events，不代表远端全局审计。
