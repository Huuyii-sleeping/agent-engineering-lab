## Context

当前 `agent-cli` 已经有完整的 CLI / TUI 本地控制面，也有 `skills` prompt section 这个结构位，但真实技能链路仍然断在两处：

- 配置层始终返回 `skills: []`，没有本地扫描与选择式注入；
- 终端入口层没有 `dump-system-prompt` 这样的轻量 inspection path，用户只能真正发起一轮 query 才能间接观察 prompt 效果。

这轮改动横跨 `config`、`prompt`、`tools`、`cli`、`tui` 与新建 `skills/loader`，属于小范围跨层联动，先把决策写清楚能避免实现时把“发现能力”和“运行时注入”混成一团。

## Goals / Non-Goals

**Goals:**

- 让仓库具备真实的本地 skill discovery / loading 能力，而不只是 prompt 占位。
- 让 skills 可以按配置选择式进入稳定 system prompt，而不是默认全量灌入。
- 让 CLI / TUI 和轻量 entrypoint 都能直接 inspect skills 与当前 stable prompt。

**Non-Goals:**

- 不实现完整 plugin marketplace 或 skill 安装生命周期。
- 不改模型调用协议、query runtime 主循环或权限架构。
- 不引入新的前端渲染框架。

## Decisions

### Decision 1: skill discovery 采用“当前 cwd 向上搜索工作区根 + 显式 env roots”

采纳：

- 默认从当前 `cwd` 向上递归搜索每一级的 `.codex/skills` 与 `skills`。
- 允许通过 `AGENT_SKILL_ROOTS` 追加额外 roots。
- 重名 skill 按“更近的 root 优先”决议。

原因：

- CLI 很常见的启动位置是仓库子目录，如果只看当前 `cwd` 会漏掉项目根目录技能。
- 先解决本地 repo / workspace skill 的稳定发现，比直接依赖用户 home 目录更可控。

备选方案：

- 只扫描当前 `cwd/.codex/skills`。

不采用原因：

- 从子目录进入 CLI 会直接失效，体验很脆弱。

### Decision 2: skills 注入主 prompt 采用显式 opt-in，而不是默认全量注入

采纳：

- `AGENT_SKILLS=name1,name2` 注入指定 skills。
- `AGENT_SKILLS=all` 才全量注入。
- 未选中的 skill 仍可通过 `load_skill` 按需读取。

原因：

- skill body 往往很长，默认全量注入会迅速抬高稳定 prompt token 成本。
- 架构上更接近“默认 discovery，按需 activate”的分层思路。

备选方案：

- 发现到的所有 skill 都自动进入 prompt。

不采用原因：

- 容易造成 prompt 膨胀，也让 skill 的可见性和实际生效边界不清楚。

### Decision 3: inspection surface 统一走本地 renderer，不进入模型请求链路

采纳：

- 新增 `/skills`、`/skill <name>`、`/prompt`。
- 新增 `agent-cli dump-system-prompt`。
- 输出使用统一 CLI renderer，而不是发模型总结。

原因：

- 这类能力本质上是本地诊断和查看，不应再消耗一轮模型请求。
- 本地 renderer 能让 CLI 和 TUI 共享同一套输出语义。

备选方案：

- 通过 `/tools` 或一次真实 query 间接查看。

不采用原因：

- 操作更绕，且无法稳定复用为轻量入口。

## Risks / Trade-offs

- [Risk] 向上搜索 roots 后，重名 skill 的来源可能让用户误判
  - Mitigation：列表和详情输出都展示真实 path / root

- [Risk] `AGENT_SKILLS=all` 可能让 prompt 体积显著增加
  - Mitigation：保持默认不注入，且 `/prompt` 可先行查看

- [Risk] frontmatter 解析若过度追求 YAML 完整性，会把实现复杂度抬高
  - Mitigation：本轮只解析基础 top-level scalar metadata，满足当前 skill 文档形态

## Migration Plan

1. 先增加 `skills/loader.ts`、`prompt/inspect.ts` 与 `dump-system-prompt` entrypoint。
2. 再接 `list_skills` / `load_skill` 工具和 `AGENT_SKILLS` prompt 注入。
3. 最后同步 CLI / TUI commands、completion、palette、tests 和主规格。

本次不涉及数据迁移。若后续要回退，只需回退 skills loader 与 inspection surface 相关改动即可。

## Open Questions

- 后续是否需要把 skill roots 与 plugin roots 统一成单独的 runtime config 模块。
- 如果将来接入真正的 plugin marketplace，`load_skill` 是否继续保持“纯本地文件视图”语义。
