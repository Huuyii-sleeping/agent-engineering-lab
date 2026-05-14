## Context

上一轮已经把 `/help` 和 TUI guide 做了分层，但“发现能力”依然要靠用户手打，且 transcript 只存在两种状态：

- CLI 中几乎没有本地回看能力；
- TUI 中只能看到会话末尾固定几条摘要。

这意味着当前控制面更像“能操控”，还不像“能浏览”。现有架构已经有 session history、slash command dispatcher 和共享 renderer，因此这轮不需要改 runtime，只需要在本地交互层增加 completion 和 transcript browser。

## Goals / Non-Goals

**Goals:**

- 为 CLI 与 TUI 增加共享的本地 `Tab` 补全逻辑。
- 为当前 session 提供可分页、可搜索、可展开单条的 transcript 浏览能力。
- 让 TUI Conversation panel 可以被本地浏览状态驱动，而不是永远只显示 recent tail。
- 保持零依赖实现，复用已有 `readline`、`cli-ui` 和 `dispatchCliCommand`。

**Non-Goals:**

- 不实现模型生成式补全。
- 不引入全文索引、向量检索或外部数据库。
- 不做鼠标交互或 Web transcript 页面。
- 不改变 session history 的底层写入语义。

## Decisions

### Decision 1: 用共享 completion helper 驱动 CLI 和 TUI

采纳：

- 抽出 `cli-completion` helper，输入当前 line 和本地上下文，返回补全候选。
- CLI 和 TUI 都通过 `readline` 的 completer 复用同一逻辑。
- 补全优先覆盖高频本地命令和确定性参数，而不是试图补全自然语言正文。

不采用：

- 只在某个入口做补全，或者把补全直接散落在 `cli.ts` / `tui.ts` 中。

原因：

- 这类体验能力必须统一，否则普通 CLI 和 TUI 会迅速分叉。

### Decision 2: transcript 浏览先做命令式 browser，而不是引入复杂滚动模式

采纳：

- 增加 `/history`、`/search`、`/peek`、`/tail` 这类本地命令。
- 用一个轻量 browser state 记录当前 session 的浏览模式，并驱动 TUI Conversation panel。

不采用：

- 先做完整的键盘滚动、焦点切换或可视滚动条。

原因：

- 现有终端底座最适合命令式浏览。先把“能看全、能搜、能展开”补齐，比一次性做复杂滚动模式更稳。

### Decision 3: 浏览状态按 session 隔离

采纳：

- transcript browser state 按 session 保存。
- 切换 session 后显示该 session 自己的 tail / history / search / peek 状态。

不采用：

- 全局只有一份浏览状态，跨 session 复用。

原因：

- transcript 浏览本质上属于 session 局部状态，跨 session 共享会造成明显错位。

## Risks / Trade-offs

- [Risk] 补全候选过多影响可读性 -> Mitigation：按命令上下文收敛候选，并限制 transcript index 建议数量。
- [Risk] transcript 内容较长导致面板刷屏 -> Mitigation：history/search 默认只展示摘要，完整内容必须通过 `/peek` 展开。
- [Risk] TUI 面板状态过多增加心智负担 -> Mitigation：footer 与 guide 明确提供 `/tail` 返回 live tail 的入口。
