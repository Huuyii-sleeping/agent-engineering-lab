# 设计

## Agent service

新增 service 方法：

```ts
resolveAgentSkills(input: unknown): Record<string, unknown>
```

流程：

1. 用现有 `normalizeAgentRuntimeContext()` 清洗输入。
2. 无合法 agent id 时返回 `INVALID_AGENT_CONTEXT`。
3. 调用 `resolveBoundSkills(agent)`。
4. 失败时返回与 chat 相同的 `AGENT_SKILL_LOAD_FAILED` details。
5. 成功时返回 skill 摘要：
   - `name`
   - `sourceType`
   - `path`
   - `contentLength`

不返回 `content`，避免通过诊断接口泄露完整 Skill prompt。

## HTTP

Agent service:

```text
POST /skills/resolve
```

BFF:

```text
POST /api/agent-skills/resolve
```

BFF 只做透明代理，后续 Web 可直接用该接口做 Agent 配置页健康检查。

## 错误策略

预检错误必须早、明确、可见：

- Agent context 缺失：`400 INVALID_AGENT_CONTEXT`
- Skill 解析失败：`400 AGENT_SKILL_LOAD_FAILED`
- BFF 上游不可用：沿用现有 `AGENT_UPSTREAM_UNAVAILABLE`
