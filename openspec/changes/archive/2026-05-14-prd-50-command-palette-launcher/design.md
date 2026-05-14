## Context

上一轮已经把 `Tab` 补全和 transcript 浏览补齐，但当前终端交互仍然要求用户显式知道命令名称。实际差距已经从“找不到功能”变成“要记很多命令”。

现有终端底座已经具备这些前提：

- 本地 slash command dispatcher
- help topic registry
- session / transcript / runtime 的本地状态
- raw-mode TUI 快捷键入口

因此这轮最合适的方向不是再扩命令集，而是新增一个统一 launcher，把“发现 -> 选择 -> 执行”收敛到本地 palette。

## Goals / Non-Goals

**Goals:**

- 提供一个统一的本地 command palette 入口。
- 支持本地 fuzzy search，而不是只列静态命令清单。
- 支持从 palette 候选直接执行本地动作。
- 让 CLI 和 TUI 共享同一份 palette 数据与搜索逻辑。

**Non-Goals:**

- 不实现图形化 overlay 或弹层。
- 不做模型生成式推荐。
- 不做基于历史点击率的复杂排序学习。
- 不改变已有 slash command 的真实业务语义。

## Decisions

### Decision 1: 用命令式 palette，而不是先做全屏 overlay

采纳：

- 用 `/palette`、`/palette <query>` 和 `/palette open <index>` 形成一套命令式 launcher。
- TUI 的 `Ctrl+K` 直接触发 `/palette`，让用户快速进入本地候选面。

不采用：

- 先做独立的弹窗式 overlay。

原因：

- 当前终端底座仍是 readline/ANSI 路线。命令式 palette 可以最小代价复用现有 renderer 和 dispatcher，同时已经能提供统一 launcher 能力。

### Decision 2: Palette 候选分为静态动作和动态会话候选

采纳：

- 静态候选覆盖 help、runtime、approvals、composer、transcript 浏览等高频动作。
- 动态候选覆盖当前已知 session 切换入口。
- 所有候选都归一到“标题 + group + summary + command”结构，便于统一搜索和渲染。

不采用：

- 只搜索命令字符串本身。

原因：

- 纯命令字符串搜索过于机械，用户往往记得的是“我要看 transcript”或“切到 review session”，不是精确命令。

### Decision 3: 最近 palette 结果按 session 保存

采纳：

- `/palette open <index>` 依赖最近一次 palette 结果。
- 结果按 session 隔离，避免跨 session 切换后执行错位候选。

不采用：

- 全局只有一份 palette 结果。

原因：

- session 本身就是当前 CLI/TUI 的核心局部上下文，palette 结果跟着 session 走更稳定。

## Risks / Trade-offs

- [Risk] palette 候选过多导致输出噪声回潮 -> Mitigation：默认结果限制条数，并优先展示高分候选。
- [Risk] 候选执行语义不清 -> Mitigation：每个候选都显示最终将执行的本地命令。
- [Risk] palette 与 help topic 重复 -> Mitigation：把 palette 定位为 launcher，不替代 help；help 继续负责解释，palette 负责找入口。
