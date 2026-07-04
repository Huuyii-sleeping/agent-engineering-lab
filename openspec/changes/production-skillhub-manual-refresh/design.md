# 设计

## 数据流

复用现有 `refreshSkills()`：

- `syncSkillRegistry()`：同步 registry 并返回 registry settings。
- `fetchSkills()`：读取最新 Skill 列表。
- `fetchSkillAuditEvents()`：读取最新审计事件。

App 新增 `skillRegistryRefreshing` 状态，并把 `onRefreshRegistry` 和状态传入 SkillHubPage。

## UI

刷新入口放在 `Hub readiness` 摘要条右侧，和健康指标同层级：

```text
Hub readiness ... [刷新 registry]
已安装 N / 可升级 N / 失败事件 N
```

刷新中：

```text
同步中
```

按钮禁用，避免重复请求。

## 错误处理

刷新失败沿用 App 现有 `setError()` 全局错误展示，不在本阶段新增局部错误区域。

## 风险

- `refreshSkills()` 仍会触发 registry 同步；如果远端慢，按钮会保持同步中。
- 页面初始加载和手动刷新共用同一状态可能使按钮短暂禁用，这是可接受的生产级反馈。
