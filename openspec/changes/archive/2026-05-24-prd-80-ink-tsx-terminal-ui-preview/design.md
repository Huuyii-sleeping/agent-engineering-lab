## Context

现有 `apps/agent-cli/src/entrypoints/tui.ts` 是成熟的全屏 TUI，包含 session、palette、composer、transcript、runtime panels 和 raw keypress 处理。直接重写会扩大风险，也会把本轮目标从“验证 TSX 组件化终端 UI”变成大规模迁移。

## Goals / Non-Goals

**Goals:**

- 新增一个组件化 TSX 终端 UI 预览入口。
- 入口与现有 `tui` 并存，并通过 dispatcher 暴露。
- 预览 UI 复用现有 CLI 本地信息源，避免业务事实重复。
- 支持自动化 smoke：管道输入 `q` 后退出。

**Non-Goals:**

- 不替换 `entrypoints/tui.ts`。
- 不复刻现有 TUI 的全部交互状态机。
- 不在本轮引入跨进程 UI runtime 或 Web surface。

## Decisions

### Decision 1: 新增 `tui-ink` 入口，而不是重写 `tui`

选择：新增 `agent-cli tui-ink` 和 `agent-cli --tui-ink`。

理由：现有 `tui` 已承载大量用户可见行为。并行入口可以让 TSX 方案先验证依赖、编译、渲染、测试和退出模型，后续再决定是否迁移具体 panels。

备选方案：直接把 `tui.ts` 改为 Ink。未采用原因是风险过大，且会混入 raw mode、palette 状态机和 session runtime 迁移。

### Decision 2: 使用 Ink + React TSX

选择：新增 `react`、`ink` 和 `@types/react`，组件文件使用 `.tsx`。

理由：Ink 是 React 终端渲染的成熟实现，能用 TSX 表达布局和交互，最接近用户提出的 Claude Code 风格。

备选方案：自研 TSX renderer。未采用原因是本轮目标是产品体验与工程形态，不应重新实现 React reconciler 或终端 layout。

### Decision 3: 先做 snapshot 数据适配层

选择：新增纯函数构造 Ink TUI preview snapshot，组件只消费结构化数据。

理由：这样可以用单元测试覆盖关键输出，不依赖真实 TTY；也能让后续从现有 TUI 或 runtime service 注入真实状态。

备选方案：组件中直接读取 palette、session 和 runtime 状态。未采用原因是会让组件难测，并扩大入口副作用。

## Risks / Trade-offs

- [Risk] 新增依赖增加包体积。→ Mitigation：仅用于独立预览入口，不影响默认 `agent-cli` 和 `agent-cli tui` 路径。
- [Risk] Ink 在非 TTY 管道下退出时机不稳定。→ Mitigation：入口监听 stdin，收到 `q`、`Esc` 或 `Ctrl+C` 后主动 unmount 并 resolve。
- [Risk] `.tsx` 编译配置影响现有构建。→ Mitigation：只添加 `jsx: react-jsx` 与 `src/**/*.tsx` include，保持 module / moduleResolution 不变。

## Migration Plan

无需数据迁移。现有命令保持不变。后续若验证通过，可逐步把现有 TUI panels 抽成可共享 snapshot 与 Ink 组件。

## Open Questions

无。
