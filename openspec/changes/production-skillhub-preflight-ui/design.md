# 设计

## API client

新增类型：

- `AgentResolvedSkillSummary`
- `AgentSkillPreflightIssue`
- `AgentSkillPreflightResult`

新增函数：

```ts
resolveAgentSkills(agent: AgentRuntimeContext): Promise<AgentSkillPreflightResult>
```

该函数不使用通用 `requestJson()`，因为预检失败是可展示状态，不应直接 throw。

## App state

App 持有：

```ts
agentSkillPreflight: AgentSkillPreflightResult | null
agentSkillPreflightLoading: boolean
```

草稿变化、切换 Agent、新建/删除/保存后清空旧状态。

## UI

AgentConfigPage 在 Skills 区域顶部展示运行时检查条：

- 未检查：提示可运行预检。
- 检查中：按钮禁用。
- 成功：显示解析通过的 Skill 数量。
- 失败：显示首条失败信息。

该面板只作为诊断提示，不阻塞保存和测试，避免预检接口不可用时影响原有主流程。
