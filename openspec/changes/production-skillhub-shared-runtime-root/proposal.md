# production-skillhub-shared-runtime-root

## Why

`production-skillhub-runtime-loader` 已经让 Agent runtime 可以按版本加载本地 SkillHub package，但 BFF 安装 package 的 data root 和 Agent 读取 root 仍需要人工分别配置。

生产部署里这会导致一个常见断点：Web/BFF 显示 Skill 已安装，Agent session 也携带了绑定信息，但 Agent service 没有指向同一个 package root，最终返回 `AGENT_SKILL_LOAD_FAILED`。

## What Changes

- 引入共享配置 `SKILLHUB_DATA_ROOT`，作为 BFF 写入 SkillHub package 和 Agent 读取 SkillHub package 的共同约定。
- BFF 启动时解析 `SKILLHUB_DATA_ROOT` 并传入 `SkillStoreService`。
- Agent loader 在未设置 `AGENT_SKILLHUB_ROOTS` 时使用 `SKILLHUB_DATA_ROOT` 作为 fallback。
- 保留 `AGENT_SKILLHUB_ROOTS` 的最高优先级，支持复杂多 root 部署。

## Non-Goals

- 不改变 HTTP API。
- 不实现 Agent service 自动下载 Skill package。
- 不改变 Skill package 存储结构。
- 不处理多租户隔离和权限映射。

## Acceptance Criteria

- BFF 的 `resolveSkillHubDataRoot()` 可从 `SKILLHUB_DATA_ROOT` 读取共享 package root。
- BFF main 将该 root 注入 SkillStore。
- Agent loader 未配置 `AGENT_SKILLHUB_ROOTS` 时可从 `SKILLHUB_DATA_ROOT` 解析 SkillHub root。
- 显式 `AGENT_SKILLHUB_ROOTS` 优先于 `SKILLHUB_DATA_ROOT`。
- BFF config 测试和 agent-cli loader 测试覆盖上述行为。
