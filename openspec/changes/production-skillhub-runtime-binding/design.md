# 设计

## BFF 保存校验

在 `AgentProfileService` 注入 `SkillRegistryService`，保存 Agent 前读取 `listSkills()`。

校验规则：

- 只校验非空绑定；没有选择 Skill 的 Agent 允许保存。
- 每个绑定的 `skillId` 必须存在于安装列表。
- 每个绑定的版本必须等于 `installedVersion || version`。
- `sourceType` 和 `registrySource` 必须与安装项一致。
- 旧 payload 只传 `skillIds` 时，BFF 根据安装状态补齐精确绑定。

错误返回：

```json
{
  "ok": false,
  "error": {
    "code": "AGENT_SKILL_BINDING_INVALID",
    "message": "agent skill binding is invalid",
    "details": [...]
  }
}
```

## Web 绑定健康状态

Agent 配置页基于 `draft.skills` 和 `installedSkills` 计算状态：

- 正常：绑定版本与 installed version 一致。
- 已卸载：安装列表没有该 skill。
- 版本缺失：绑定 version 为空。
- 版本漂移：绑定 version 与 installed version 不一致。

保存时仍沿用第四阶段逻辑，从当前安装项重建绑定。

## 运行时上下文

Web API 新增可选 Agent 上下文：

```ts
type AgentRuntimeContext = {
  id: string;
  name: string;
  skills: AgentSkillBinding[];
};
```

`createSession` 和 `sendSessionMessageStream` 可带该上下文。BFF 转发给 agent service 时放在 `agent` 字段。

agent service 的 `AgentSessionRecord` 增加：

```ts
agent: AgentRuntimeContext | null
```

创建 session 或 chat 请求带入 agent 时更新 session 记录，并在 summary/detail 中返回。

## 风险

- 真正的 Skill loader 仍按当前本地文件发现机制工作；本阶段先完成运行时契约和持久化上下文。
- 如果用户在打开 Agent 配置后卸载 Skill，保存时 BFF 会拒绝旧绑定，Web 需要刷新安装列表后再保存。
