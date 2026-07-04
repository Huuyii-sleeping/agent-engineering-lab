# 设计

## 判定规则

新增纯函数：

```ts
isPrimarySkillActionDisabled(skill)
```

返回 `true` 的场景：

- `skill.status === "invalid"`。
- `skill.deprecated && skill.status === "available"`。

## UI 行为

- 卡片主按钮和详情主按钮都复用同一个判定函数。
- 主按钮文案继续复用 `skillActionLabel()`，因此 invalid 显示 `不可用`。
- `requestSkillAction()` 在事件入口再次判断并直接返回，作为防御性保护。

## 风险

- 已安装 Skill 即使后续被标记 deprecated，也不在本阶段强行禁用卸载能力。
- 后端仍应保留最终校验；前端门禁只负责减少误操作。
