# production-skillhub-rollback-ui

## Why

`production-skillhub-install-state` 已经在 BFF 和 API client 中支持 Skill 版本升级与回滚，但 Web Skill Hub 只暴露了下载、安装、升级和卸载路径。用户升级后如果新版本不适合当前 Agent，无法在界面上回到上一版本。

本阶段补齐 Web 端回滚入口，让版本化安装状态形成可操作闭环。

## What Changes

- Skill Hub 卡片在存在 `previousInstalledVersion` 时展示上一版本提示。
- 已安装 Skill 可触发回滚操作。
- App 将回滚动作接入现有 Skill registry 刷新逻辑。
- 页面测试覆盖回滚提示和按钮。

## Non-Goals

- 不新增 Skill 详情页。
- 不改 BFF rollback 语义。
- 不实现多版本历史列表。
- 不自动回滚 Agent 绑定。

## Acceptance Criteria

- 已安装且存在上一版本的 Skill 显示 `可回滚到 vX`。
- 用户可点击回滚按钮并调用 `rollbackSkill()`。
- 回滚后 Skill registry 中对应卡片更新为 BFF 返回的状态。
- 页面测试覆盖回滚入口渲染。
