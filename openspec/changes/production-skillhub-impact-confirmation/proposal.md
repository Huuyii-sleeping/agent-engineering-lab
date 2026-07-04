# production-skillhub-impact-confirmation

## Why

SkillHub 详情面板已经能展示哪些 Agent 正在绑定某个 Skill，但升级、卸载和回滚仍然是直接执行。生产级 SkillHub 在影响 Agent 行为前，应把影响范围作为确认步骤展示出来，避免用户误操作破坏已配置 Agent。

本阶段增加影响确认，不阻止操作，但要求用户在会影响 Agent 的场景下明确确认。

## What Changes

- SkillHub 对升级、卸载、回滚等影响性操作增加确认面板。
- 确认面板展示受影响 Agent 列表和绑定版本。
- 无 Agent 使用时保持直接执行。
- 主按钮文案明确区分“升级 / 卸载 / 安装 / 下载”。

## Non-Goals

- 不新增 BFF API。
- 不实现权限审批流。
- 不阻止管理员或用户继续操作。
- 不修改 Agent 绑定。

## Acceptance Criteria

- 对有 Agent 使用的 Skill 执行升级、卸载或回滚时，先展示确认面板。
- 确认面板列出受影响 Agent。
- 用户取消后不触发操作。
- 用户确认后才触发原有操作回调。
- 无 Agent 使用时操作保持直接执行。
