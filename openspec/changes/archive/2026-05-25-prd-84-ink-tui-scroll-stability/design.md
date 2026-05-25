## Context

Ink 默认在主终端缓冲区渲染。对于长消息流，主缓冲区重绘会影响终端原生 scrollback；当用户已经滚动到底部时，周期性重绘会表现为滚动条抖动。

## Decisions

### Decision 1: 交互式 Ink TUI 使用 alternate screen

选择：TTY interactive render 设置 `alternateScreen: true`。

理由：TUI 应该拥有独立屏幕缓冲区，避免把每一帧写入主终端 scrollback。非 TTY 渲染不启用该选项，保持 smoke 输出稳定。

### Decision 2: scheduler busy 状态不参与 React render

选择：将 scheduled tick busy 标记改为 `useRef`，并且空 tick 直接返回，不调用 `setState`。

理由：busy 标记只是防重入状态，不需要展示在 UI 中；将它放进 React state 会制造无内容变化的周期性重绘。

## Risks

- [Risk] alternate screen 不保留滚动历史。Mitigation：这是 TUI 的预期行为，后续如需历史查看应实现应用内 transcript/history，而不是依赖终端 scrollback。
