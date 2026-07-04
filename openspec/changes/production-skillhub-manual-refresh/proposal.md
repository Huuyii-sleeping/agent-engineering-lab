# production-skillhub-manual-refresh

## Why

SkillHub 已经能在页面加载时同步 registry，并展示健康摘要，但用户没有明确的手动刷新入口。生产级控制台需要让用户在看到 registry 过期、失败或刚发布新 Skill 后，主动重新同步并刷新列表。

本阶段在健康摘要中增加手动刷新 registry 的操作。

## What Changes

- App 暴露刷新 SkillHub registry 的回调和刷新中状态。
- SkillHubPage 在健康摘要中展示刷新按钮。
- 刷新进行中时按钮禁用并显示同步中。
- 测试覆盖刷新按钮和刷新中状态。

## Non-Goals

- 不新增 BFF API。
- 不做自动轮询。
- 不引入后台任务队列。

## Acceptance Criteria

- SkillHub 健康摘要提供刷新 registry 的按钮。
- 点击刷新会复用现有 registry 同步和 Skill 列表刷新逻辑。
- 刷新进行中按钮不可重复点击。
- 页面测试覆盖默认态和刷新中态。
