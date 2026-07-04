# 设计

## 确认触发条件

当选中操作满足以下条件时展示确认面板：

- 当前 Skill 至少被一个 Agent 绑定；
- 操作是升级、卸载或回滚。

下载和安装不会影响现有 Agent，继续直接执行。

## 状态

`SkillHubPage` 持有：

```ts
type PendingSkillImpactAction = {
  skillId: string;
  kind: "primary" | "rollback";
};
```

确认面板根据 `skillId` 找到当前 Skill，根据 `kind` 决定执行 `onSkillAction()` 或 `onRollbackSkill()`。

## 文案

主按钮文案需要表达真实动作：

- `available`：下载
- `downloaded`：安装
- `updateAvailable`：升级
- `installed`：卸载
- `invalid`：不可用

确认面板标题展示将要执行的动作，例如“确认升级代码工作区”。

## 风险

- 本阶段只基于 Web 已加载 Agent profiles 计算影响范围；如果 Agent 列表未刷新，确认内容可能不是全局实时视图。
- 确认面板不是权限控制，只是误操作防护。
