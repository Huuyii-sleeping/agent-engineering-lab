# production-skillhub-agent-impact

## Why

SkillHub 现在能展示 Skill 的版本、来源、权限和回滚目标，但升级或回滚前仍缺少影响范围。用户需要知道哪些 Agent 正在绑定这个 Skill，才能判断操作是否会影响现有工作流。

本阶段把 Agent 使用关系展示到 Skill 详情面板，先基于 Web 已加载的 Agent profiles 做本地计算，不新增 BFF API。

## What Changes

- `SkillHubPage` 接收 Agent profiles。
- Skill 详情面板展示正在使用该 Skill 的 Agent 数量和列表。
- 同时兼容 legacy `skillIds` 与版本化 `skills` 绑定。
- 测试覆盖 Agent 使用范围展示。

## Non-Goals

- 不新增 Agent 使用影响 BFF API。
- 不阻止升级、卸载或回滚操作。
- 不展示运行中的 session 影响。
- 不自动修改 Agent 绑定。

## Acceptance Criteria

- 详情面板显示“使用中的 Agent”区块。
- 绑定当前 Skill 的 Agent 会出现在列表中。
- 未绑定当前 Skill 的 Agent 不会出现在列表中。
- 无使用者时展示空状态。
