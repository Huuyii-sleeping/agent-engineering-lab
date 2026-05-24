## Context

参考仓库 `liuup/claude-code-analysis` 的 `src` 目录显示，Claude Code 的终端 UI 主要通过 TSX 组件组合：

- `PromptInput/PromptInput.tsx`：底部输入区使用横向 `Box`、`borderStyle="round"`、隐藏左右边框、mode indicator、文本输入和 footer。
- `StatusLine.tsx`：状态栏是单行 `Box paddingX` + dim/truncated 文本，不是独立大卡片。
- `design-system/Pane.tsx`：slash command surface 是顶部 divider + padding，而不是多层卡片。
- `messages/AssistantTextMessage.tsx`：消息流使用左侧标记、缩进、dim/error/suggestion 等文本层级。

## Goals / Non-Goals

**Goals:**

- 让 `tui-ink` 首屏像终端 REPL，而不是配置 dashboard。
- 明确展示 message stream、statusline、prompt、footer 和 slash pane。
- 保持实现为可测试的 snapshot + 纯 TSX 组件。

**Non-Goals:**

- 不复制 Claude Code 源码。
- 不实现真实多行编辑、历史搜索或 overlay portal。
- 不改变 `agent-cli tui`。

## Decisions

### Decision 1: 采用 REPL preview snapshot

选择：snapshot 输出 `header`、`messages`、`slashPane`、`statusLine`、`prompt`、`footerHints`。

理由：这更接近 Claude Code 的终端结构，也能通过单元测试避免回退到卡片 dashboard。

### Decision 2: 使用少量分隔线和底部 prompt border

选择：顶部 header 只保留 byline，主体不使用多张大卡片；prompt 使用横向 bordered box，并关闭左右边框。

理由：Claude Code 的主要视觉重心在消息流和输入区，状态信息通过 dim text 和 footer hints 承载。

### Decision 3: 保留预览入口属性

选择：继续让 `tui-ink` 只展示本地预览内容和退出键。

理由：本轮目标是视觉与组件结构抛光，不扩大到真实 runtime 交互迁移。

## Risks / Trade-offs

- [Risk] 预览仍不是完整 Claude Code 交互。→ Mitigation：文案标明 preview，并保留后续可迁移边界。
- [Risk] 非 TTY smoke 下 border 渲染差异。→ Mitigation：测试匹配稳定文本，不依赖边框字符。

## Migration Plan

无需数据迁移。`tui-ink` 的命令入口不变。

## Open Questions

无。
