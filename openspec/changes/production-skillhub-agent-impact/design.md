# 设计

## 数据来源

Web `App` 已经加载 `agents: AgentProfile[]`。本阶段直接把该列表传入 `SkillHubPage`，避免为了展示影响范围新增 BFF 接口。

## 使用关系判定

某个 Agent 视为使用当前 Skill，当满足任一条件：

- `agent.skills` 中存在 `binding.skillId === skill.id`
- legacy `agent.skillIds` 中包含 `skill.id`

展示时优先使用版本化绑定的 `version`，没有版本时显示“未锁定版本”。

## 详情面板

新增区块：

```text
使用中的 Agent
2 个 Agent 正在绑定
- 研发 Agent / v1.2.0
- 文档 Agent / 未锁定版本
```

该区块只做信息展示，不改变现有安装、升级、回滚按钮行为。

## 风险

- Web 端 Agent 列表可能尚未加载完成，此时展示为空。当前 App 在进入工作台时已有刷新逻辑，本阶段不额外加 loading 状态。
- 影响范围只覆盖 Agent profile 静态绑定，不覆盖历史 session 或运行中任务。
