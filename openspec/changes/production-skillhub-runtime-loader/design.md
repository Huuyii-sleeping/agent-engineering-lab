# 设计

## SkillHub package roots

Agent CLI 新增运行时配置：

```text
AGENT_SKILLHUB_ROOTS=/path/to/skills-data
```

支持多个 root，使用平台 `path.delimiter` 分隔。每个 root 按 BFF 当前包存储结构查找：

```text
<root>/<sourceType>/<skillId>/<version>/SKILL.md
<root>/<sourceType>/<skillId>/<version>/skill.json
```

其中 `sourceType` 为 `remote` 或 `custom`。`builtin` Skill 仍从现有 local skill roots 中按 `name` 解析，但必须校验版本 metadata 或 `skill.json` version 与绑定一致；如果无法证明版本一致，则失败。

## 绑定解析

新增 `resolveBoundSkills(context, options)`：

- 输入 `AgentRuntimeContext`。
- 对每个 binding 精确解析 Skill 文件。
- 去重策略按 `skillId` 后写覆盖前写，与当前绑定归一化一致。
- 返回：

```ts
type BoundSkillResolution =
  | { ok: true; skills: SkillDefinition[] }
  | { ok: false; issues: BoundSkillLoadIssue[] };
```

错误 issue 至少包含：

- `skillId`
- `version`
- `sourceType`
- `code`: `SKILL_PACKAGE_NOT_FOUND` / `SKILL_VERSION_MISMATCH` / `SKILL_PACKAGE_INVALID`
- `message`

## Prompt 注入

AgentService `chat()` 在进入 `runUserQuery()` 前：

1. 如果 session 没有 agent context，继续使用 `this.promptSource`。
2. 如果 session 有 agent context，调用 `resolveBoundSkills()`。
3. 成功时用 `toPromptSkillBlocks()` 生成 skills prompt section。
4. 构造本轮 promptSource：

```ts
{
  ...this.promptSource,
  skills: toPromptSkillBlocks(boundSkills, { sessionId: session.id })
}
```

这保持 QueryEngine / prompt builder 入口不变，避免把 SkillHub 解析逻辑扩散到模型请求层。

## 失败策略

失败要尽早、明确、可见：

- 任一绑定解析失败，本轮 chat 不进入 query runtime。
- 返回：

```json
{
  "ok": false,
  "error": {
    "code": "AGENT_SKILL_LOAD_FAILED",
    "message": "agent skill binding could not be loaded",
    "details": [...]
  },
  "session": { "...": "summary" }
}
```

这样 BFF/Web 可以直接展示失败原因，避免 assistant 在缺少能力的情况下继续生成看似成功的结果。

## 测试策略

- loader 单测：按 SkillHub root 加载 remote/custom package。
- agent service 单测：带 Agent context 的 chat 注入绑定 Skill prompt。
- agent service 单测：缺失绑定返回结构化错误，query runtime 不运行。
- 回归：无 Agent context 的 chat 仍使用原 promptSource。

## 风险

- 本地 dev 时 BFF 和 Agent CLI 的 data root 可能不同；需要通过 `AGENT_SKILLHUB_ROOTS` 显式对齐。
- builtin Skill 缺少标准 `skill.json` version 时，版本校验会失败；如果需要兼容，可后续引入 builtin manifest。
