## Context

当前 CLI/TUI 的主要缺口不在状态可见性，而在输入编排。已有实现是 readline 单行输入，天然缺少：

- 多行草稿
- 本地预览
- 发送前取消
- 输入状态显式切换

## Goals / Non-Goals

**Goals:**

- 提供可共享的 composer 状态层。
- 支持多行输入闭环。
- 让 CLI 和 TUI 共享命令和提示语义。
- 保持实现轻量，不引入复杂编辑器框架。

**Non-Goals:**

- 不集成外部编辑器。
- 不引入全屏富文本编辑区。
- 不调整 runtime / model / tool 核心语义。

## Decisions

### Decision 1: 使用本地 draft store，而不是改模型或消息层

采纳：

- 在 CLI 产品层增加本地 composer store，以 session 维度维护 draft。

不采用：

- 直接把未发送草稿写进会话历史。

原因：

- 草稿在用户确认发送前不应污染真实 conversation history。

### Decision 2: 通过 slash commands 管理 composer 生命周期

采纳：

- `/compose` 进入草稿模式
- `/preview` 查看草稿
- `/send` 发送草稿
- `/cancel` 丢弃草稿

不采用：

- 依赖终端特殊键位或 OS 编辑器。

原因：

- slash command 可发现、可测试、可跨终端保持一致。

### Decision 3: composer 模式下普通输入只追加，不执行隐式快捷动作

采纳：

- 草稿模式中普通文本只追加到 draft。
- 审批快捷词等隐式动作在草稿模式下不触发。

原因：

- 用户在写多行请求时，不应因为输入了 `approve`、`yes` 等普通词而误触本地控制动作。
