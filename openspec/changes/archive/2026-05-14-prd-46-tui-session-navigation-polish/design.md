## Context

目前 session 体系已经存在，但交互仍然很硬：

- `/sessions` 只能看列表，不能直接高效切。
- `/use` 只能接受完整 id，真实使用里可操作性很差。
- TUI 的 Sessions panel 只有状态摘要，没有明确把“怎么切换”表达出来。

这一层问题属于本地交互控制面，不需要改 runtime 核心能力。

## Goals / Non-Goals

**Goals:**

- 降低多 session 场景下的切换成本。
- 让 session 选择方式更贴近日常终端使用习惯。
- 让 TUI 会话面板从“只显示”提升为“有明确操作入口”。

**Non-Goals:**

- 不引入 raw-mode 级别的全局键盘监听。
- 不实现会话重命名、收藏、搜索或持久排序。
- 不改变 session 历史、runtime state 或持久化结构。

## Decisions

### Decision 1: `/use` 支持 index / unique prefix / latest

采纳：

- `/use 2` 按 1-based 序号切换。
- `/use abc123` 在唯一前缀命中时切换。
- `/use latest` 切到最新 session。

不采用：

- 只保留完整 id。

原因：

- 当前 session id 本身较长，完整输入不符合终端交互效率预期。

### Decision 2: 用 `/next` 和 `/prev` 做循环切换，而不是先做复杂快捷键

采纳：

- 新增 `/next` 和 `/prev`，按当前 session 列表顺序循环切换。

不采用：

- 这轮直接做 raw keyboard shortcuts。

原因：

- slash command 更稳定、可测试、跨终端一致。
- 当前产品缺口首先是“切换能力不顺手”，不是“键位不够多”。

### Decision 3: Session surfaces 统一展示 index 与 active marker

采纳：

- `/sessions` 和 TUI Sessions panel 统一展示序号、active marker、busy/idle、message count。
- Controls 和 footer 明确提示 `/use`、`/next`、`/prev`。

不采用：

- 只改 `/sessions` 文本，不动 TUI 面板。

原因：

- 用户在 TUI 里做会话切换时，核心反馈应直接在主界面出现。

## Risks / Trade-offs

- [前缀匹配歧义] -> 多命中时返回明确错误，并提示使用 `/sessions` 或完整 id。
- [会话顺序心智不清] -> 统一以 `listSessions()` 当前顺序作为 index 与 next/prev 基准，并在列表中直接展示序号。
- [范围膨胀到键盘系统] -> 这轮显式排除 raw keyboard shortcuts，只做命令与 UI 产品面。
