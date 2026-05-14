## Context

当前 `agent-cli` 已经具备本地 palette、transcript browser 和 TUI dashboard，但三个能力仍然是分散演进的：

- palette 已有 fuzzy search 和 overlay，但候选仍然是单层列表，扫读成本偏高；
- transcript browser 只有基础翻页、搜索和单条展开，缺少连续导航；
- 本地交互面默认只有通用 Agent 语义，没有稳定的 workflow surface 来承接 draw / image brief 类工作流。

这次改动跨越 `cli-commands`、`cli-ui`、`cli-palette`、`cli-transcript`、`cli.ts` 和 `entrypoints/tui.ts`，属于典型的交互表面联动变更，适合先把技术决策写清楚。

## Goals / Non-Goals

**Goals:**

- 让 palette 结果具备稳定分组和更清晰的本地操作提示。
- 让 transcript 浏览形成连续导航闭环，而不是一次一条命令。
- 提供本地 workflow switcher，让 CLI / TUI 能在 `agent` 与 `draw` surface 之间切换。

**Non-Goals:**

- 不实现真实图像生成后端。
- 不改 query runtime、tool runtime 或模型调用协议。
- 不引入新的终端渲染框架或复杂颜色系统。

## Decisions

### Decision 1: 把 workflow 定义为本地 surface 状态，而不是 runtime/model 状态

采纳：

- 新增 `agent` / `draw` 两种本地 workflow mode。
- workflow 只影响 prompt、banner、guide、help、palette、footer 等本地交互面。

原因：

- 当前仓库没有真实图像生成执行链路，直接把 workflow 绑定到模型或 runtime 会制造错误承诺。
- 先做稳定的本地 surface，后续再接图像 runtime 时可以沿用同一个入口。

备选方案：

- 直接把 `draw` workflow 映射到新的模型配置。

不采用原因：

- 现阶段没有对应后端链路，做成运行时切换会把“界面状态”和“实际执行能力”混在一起。

### Decision 2: palette 采用“组内按相关度排序，组间按固定顺序展示”

采纳：

- palette 搜索先算本地 fuzzy score，再按固定 group 顺序输出，每组内部按分数排序。
- CLI 和 TUI 都展示组标题，而不是只有候选行。

原因：

- 纯全局排序虽然相关度高，但组别会抖动，扫读成本更高。
- 终端 launcher 更需要稳定结构，而不是只追求单个候选的排序分。

备选方案：

- 保持完全按 score 全局排序。

不采用原因：

- 在 help、session、runtime、approval 混合命中时，视觉结构不稳定，难以形成肌肉记忆。

### Decision 3: transcript browser 增加状态化 cursor，而不是继续堆一次性命令

采纳：

- search 状态增加当前 match cursor，支持 `/search next` 和 `/search prev`。
- peek 状态支持 `/peek next` 和 `/peek prev`。
- history 状态支持 `/history first` 和 `/history last`。

原因：

- transcript 浏览本质上是本地导航问题，状态化 cursor 比反复重新输入索引更顺手。
- 这套状态可以被 CLI 输出和 TUI Conversation panel 复用。

备选方案：

- 只增加更多一次性命令，比如 `/peek 13`、`/peek 14`。

不采用原因：

- 命令数量会继续增长，但操作摩擦不会下降。

## Risks / Trade-offs

- [Risk] `draw` workflow 可能被误解为已经具备真实绘画执行链路
  - Mitigation：把它定义为本地 workflow surface，先收口入口与交互面，不改模型执行路径

- [Risk] palette 分组会让极少数高分候选不再排在绝对第一屏最前
  - Mitigation：保持组内按分数排序，并把 group 顺序设计为高频操作优先

- [Risk] transcript browser 的状态增加后更容易出现边界错误
  - Mitigation：为 search cursor、peek relative navigation 和 history first/last 增加 focused tests

## Migration Plan

1. 先增加 workflow/palette/transcript 的本地状态与命令能力。
2. 再同步 CLI / TUI renderer、completion、help 和 guide。
3. 最后补齐 focused tests、build 和 OpenSpec strict 校验。

本次变更不涉及数据迁移，也不需要回滚脚本。若后续要回退，只需回退相关本地交互逻辑即可。

## Open Questions

- 后续如果接入真实图像生成后端，是否沿用 `draw` workflow，还是扩展成更细的 `image` / `design` 子模式。
- palette 后续是否需要进一步做 pinned actions 或最近使用排序。
