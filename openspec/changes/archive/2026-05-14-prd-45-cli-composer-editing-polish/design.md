## Context

当前 composer 的核心链路已经可用，但它仍然偏“最小闭环”：

- 空输入在 CLI/TUI 主循环里会被直接忽略，导致草稿无法保留空行。
- 草稿只支持 append / preview / send / cancel，缺少轻量 rollback。
- TUI 只有 prompt/footer 的 draft 指示，没有独立 draft 视图，用户在长草稿状态下仍然缺少空间感。

这不是模型层问题，而是终端交互层还不够产品化。

## Goals / Non-Goals

**Goals:**

- 让 composer 可稳定承载代码块、日志片段、分段任务描述。
- 提供轻量本地撤回能力，而不引入复杂编辑器。
- 让 TUI 中的 draft 具备独立存在感，提升可观察性。

**Non-Goals:**

- 不引入外部编辑器集成。
- 不做全功能行编辑器或 Vim/Emacs 键位。
- 不改动 query runtime、model 请求或会话持久化语义。

## Decisions

### Decision 1: composer 模式下保留原始输入行，包括空行

采纳：

- 只有在非 composer 模式下，空输入才继续视为 no-op。
- 一旦 composer active，空字符串也作为一行写入 draft。

不采用：

- 把空行编码成占位符文本再还原。

原因：

- 直接保留原始输入更简单，也最符合用户心智。

### Decision 2: 用 `/pop [n]` 提供局部撤回，而不是引入复杂编辑命令集

采纳：

- 新增 `/pop`，默认撤回最后 1 行，可选 `/pop 3`。

不采用：

- 新增任意行替换、插入、移动等编辑能力。

原因：

- 当前最常见需求是“刚刚多写了几行，撤回一下”。
- `/pop` 足够解决 80% 的误输入问题，复杂度远小于完整编辑器。

### Decision 3: TUI 提供独立 Draft panel，而不是只增强 footer

采纳：

- composer active 时在 TUI 中展示独立 draft 面板，显示摘要和末尾若干行。

不采用：

- 只在 footer 堆更多提示信息。

原因：

- footer 适合摘要，不适合承载草稿内容。
- draft 需要成为“看得见的对象”，而不是只是一条状态。

## Risks / Trade-offs

- [TUI 信息密度上升] -> 只在 composer active 时展示 draft panel，平时保持现有布局稳定。
- [`/pop` 参数错误导致困惑] -> 对非法参数给出明确错误和用法提示。
- [长草稿预览刷屏] -> `/preview` 和 TUI draft panel 默认展示结构化摘要与末尾片段，而不是盲目全量展开。
