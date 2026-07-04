# production-skillhub-invalid-action-gate

## Why

SkillHub 已经展示 Skill 校验错误，并把 `invalid` 状态标记为不可用，但主操作按钮仍可能被点击并触发安装请求。生产级控制台应该在 UI 层阻止明显无效的生命周期操作，降低误操作和无意义请求。

本阶段增加无效 Skill 的操作门禁。

## What Changes

- 无效 Skill 的主生命周期按钮禁用。
- 已下架且尚未下载的 Skill 继续禁用。
- 点击入口也增加保护，避免绕过 disabled 状态触发回调。
- 页面测试覆盖 invalid Skill 的禁用状态。

## Non-Goals

- 不修改 BFF 生命周期接口。
- 不隐藏 invalid Skill。
- 不改变校验错误来源和规则。

## Acceptance Criteria

- `status === "invalid"` 的 Skill 显示不可用且主操作按钮禁用。
- 无效 Skill 不会从页面事件入口触发生命周期回调。
- 已有下载/安装/升级/回滚流程不受影响。
- 页面测试覆盖禁用状态。
