# 设计

## 配置约定

新增共享环境变量：

```text
SKILLHUB_DATA_ROOT=/path/to/.data/skills
```

BFF 使用该目录写入：

```text
<SKILLHUB_DATA_ROOT>/remote/<skillId>/<version>/SKILL.md
<SKILLHUB_DATA_ROOT>/custom/<skillId>/<version>/SKILL.md
```

Agent service 使用同一个目录读取 remote/custom 绑定 Skill。

## 优先级

Agent loader root 解析顺序：

1. 显式 `skillHubRoots` option。
2. `AGENT_SKILLHUB_ROOTS`，用于多 root 或 Agent 专属覆盖。
3. `SKILLHUB_DATA_ROOT`，用于 BFF/Agent 本地共享默认。
4. 空列表，保持现有失败策略。

## BFF

`resolveSkillHubDataRoot(env, cwd)` 默认返回：

```text
<cwd>/.data/skills
```

本地 dev 下 BFF 从仓库或 app 目录启动时仍有确定默认值；生产环境应显式设置 `SKILLHUB_DATA_ROOT`。

## 风险

- 共享目录需要部署层挂载到 BFF 和 Agent service 都可访问的位置。
- 如果继续使用 `AGENT_SKILLHUB_ROOTS`，它会覆盖共享默认，避免影响已有自定义部署。
