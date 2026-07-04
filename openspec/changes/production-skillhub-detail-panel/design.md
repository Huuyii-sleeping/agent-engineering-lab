# 设计

## 页面结构

`SkillHubPage` 在 Registry 区域内新增两列布局：

```text
registry bar
grid list | detail panel
```

当详情面板关闭时，列表恢复为单列占满空间。面板默认打开，并展示当前过滤结果中的第一个 Skill，避免用户进入 SkillHub 后还需要先点一次才能看到诊断信息。

## 状态

页面持有：

```ts
selectedSkillId: string | null
detailOpen: boolean
```

详情对象按以下规则选择：

1. 如果 `selectedSkillId` 能在当前 `skills` 中找到，展示它。
2. 否则展示当前过滤结果第一个 Skill。
3. 如果没有结果，不展示详情面板。

## 操作边界

详情面板不直接调用 API，只复用页面已有回调：

- `onSkillAction(skill)`：下载、安装、升级、卸载主流程。
- `onRollbackSkill(skill)`：回滚流程。

这样保持组件仍然是展示和事件派发层，业务状态更新继续留在 `App`。

## 风险

- 当前没有多版本历史 API，所以详情面板只能展示当前版本、可用版本和上一安装版本。
- 当前没有 Agent 使用关系 API，所以影响范围留到下一阶段。
