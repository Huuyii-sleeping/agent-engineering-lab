## Context

目前 TUI palette 已经有了实时本地过滤，但结果面仍然嵌在主 dashboard 中，视觉上较重。现有 renderer 已能支持多块 panel 和居中块渲染，因此可以不引入新渲染系统，先用结构重排模拟更像 launcher 的浮层。

## Goals / Non-Goals

**Goals**

- 保持 palette 的本地即时交互。
- 通过布局重排增强 launcher 感。
- 尽量不压缩主会话区。

**Non-Goals**

- 不实现真实遮罩层或半透明效果。
- 不修改 palette 搜索与执行语义。
- 不引入新的 UI 框架。

## Decisions

### Decision 1: 用顶部 command bar 表达当前输入态

采纳：

- palette 打开时，在 header 下方渲染全宽 `Command Bar`。

原因：

- 当前输入态应该先于结果被看到，这也更贴近 launcher 心智。

### Decision 2: 用居中结果块表达候选，而不是继续侵入主列布局

采纳：

- 候选列表改为居中 `Palette Results` 块。
- Conversation 区恢复稳定高度。

原因：

- 这比把 palette 塞进中栏更像一个局部浮层。

## Risks / Trade-offs

- [Risk] 仍不是真正覆盖式 overlay
  - Mitigation：先用结构重排把视觉层级做对，再考虑更深的终端 UI 能力
- [Risk] 结果块过宽时阅读噪声回升
  - Mitigation：限制结果块宽度并保持居中
