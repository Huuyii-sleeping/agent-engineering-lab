## Context

当前 `agent-cli` 的 TUI palette 已经具备本地 live filter、选中态和独立 overlay，但 `Command Bar` 与 `Palette Results` 仍然偏“状态说明面板”而不是轻量 launcher：

- 顶部 `Command Bar` 仍有较多重复元信息，占用横向与纵向空间；
- 结果行以标题优先、命令后置的方式展示，用户扫到可执行动作的速度不够快；
- 提示文案过长，导致真正重要的当前选中项与 preview 被稀释。

这次改动只影响 TUI 本地 renderer 与其测试，不修改 palette 搜索算法、命令协议、workflow 状态或模型执行链路。

## Goals / Non-Goals

**Goals:**

- 让 `Command Bar` 与 `Palette Results` 共用更轻的 overlay 视觉宽度，而不是一个全宽一个居中。
- 让 palette 结果按“命令优先、摘要补充”的方式更快扫读。
- 收口操作提示，只保留打开态最必要的键位信息。

**Non-Goals:**

- 不修改 `/palette`、`/palette open` 或 live filter 的行为语义。
- 不改 CLI 文本版 palette 输出。
- 不引入新的颜色系统、动画或富文本 renderer。

## Decisions

### Decision 1: 把这次 polish 限定在 TUI renderer，而不是继续改 palette store 或命令层

采纳：

- 只调整 `entrypoints/tui.ts` 中的 overlay 渲染结构和文案。
- 现有 `CliPaletteStore` 的搜索、分组和结果缓存逻辑保持不变。

原因：

- 当前问题主要是视觉密度和文案层级，而不是候选生成错误。
- 把 scope 限定在 renderer，可以保证是一个小而完整的增量，不会把 PRD-57 扩展成新的 launcher 语义变更。

备选方案：

- 同时重做 palette 排序、候选字段和 store 层结构。

不采用原因：

- 会把“展示抛光”和“搜索语义调整”混为一体，验证成本更高，也不符合当前小步迭代节奏。

### Decision 2: Command Bar 与 Results overlay 采用共享的窄宽度并居中

采纳：

- `Command Bar` 不再横跨几乎整个终端宽度，而是与 `Palette Results` 使用接近的共享宽度并一起居中。
- 结果面板继续保留独立标题和边框，但整体块面更轻。

原因：

- 当前全宽 `Command Bar` 会打破 launcher 的集中视觉焦点，显得更像 dashboard 横幅。
- 共用较窄宽度后，用户注意力更容易聚焦在 query、当前命令和候选列表上。

备选方案：

- 保持 `Command Bar` 全宽，只压缩内部文案。

不采用原因：

- 即使文案变短，全宽块面依旧偏重，视觉问题没有被真正解决。

### Decision 3: 结果项采用 action-first 行结构，并把操作提示收口到单行 keys hint

采纳：

- palette 结果行优先展示命令，再补充摘要或标题信息。
- 顶部 bar 只保留 query、focus、preview 三层信息。
- 操作提示集中为一条精简 keys hint，而不是多处重复描述。

原因：

- 在 launcher 场景里，用户最终要执行的是命令动作，命令优先更利于形成肌肉记忆。
- 简洁的 keys hint 足以表达 `Enter`、方向键和 `Esc`，不需要反复解释“live filter active”。

备选方案：

- 保持 title-first 结构，只微调措辞。

不采用原因：

- 标题优先会继续把动作藏在后面，扫读成本变化有限。

## Risks / Trade-offs

- [Risk] overlay 变窄后，长标题更容易换行
  - Mitigation：结果行改为命令优先，并继续复用现有 panel wrap / truncate 逻辑控制宽度

- [Risk] 提示语收口后，新用户可能少看到一部分说明
  - Mitigation：保留核心 keys hint，并继续由 `/help palette`、guide、footer 承担完整说明

- [Risk] action-first 行结构可能让部分摘要信息显示得更靠后
  - Mitigation：保留当前选中项 preview 行，让细节集中显示在 focus 区而不是每一行都铺满

## Migration Plan

1. 先更新 OpenSpec proposal / design / spec / tasks，明确这是 TUI overlay 抛光而不是语义扩展。
2. 再修改 `entrypoints/tui.ts` 的 overlay 宽度、结果行结构和提示文案。
3. 补齐 `entrypoints/tui.test.ts` 断言，覆盖新的 compact 文案与布局。
4. 运行 focused tests、build、OpenSpec strict 和差异检查。

本次改动不涉及数据迁移，也不需要兼容旧存储格式。若需回退，只需回滚 TUI renderer 与对应测试。

## Open Questions

- 后续是否需要在 palette 中增加“最近使用”或 pinned action，而不是只做静态结构抛光。
- 如果后面接入更强的 draw workflow，是否要把当前 overlay 进一步演进成带二级 preview 的 launcher。
