# PRD-80 Ink/TSX 终端 UI 预览入口

## 背景

Claude Code 源码中的终端交互大量采用 TSX 组件化方式表达 UI。当前仓库的 `tui` 已经具备较完整能力，但实现主要集中在手写字符串和 ANSI renderer 中，继续演进复杂交互时复用、组合和局部测试成本较高。

## 目标

- 新增一个独立 Ink/TSX 终端 UI 预览入口，验证组件化 TUI 的工程形态。
- 保持现有 `agent-cli tui` 行为不变，避免一次性重写成熟交互面。
- 复用现有 CLI 本地 renderer、help、palette 等能力的数据或文案，避免复制一套业务事实。
- 提供可自动退出的 smoke 验证，确保入口可运行、可渲染、可通过键盘退出。

## 非目标

- 不在本轮完整迁移现有 `entrypoints/tui.ts`。
- 不重做现有 raw keypress、session runtime、palette 执行等复杂行为。
- 不引入远端 UI、浏览器 UI 或非终端运行形态。

## 用户故事

- 作为维护者，我希望能看到一个用 TSX 写终端 UI 的入口，从而评估后续是否逐步迁移现有 TUI。
- 作为开发者，我希望新入口和现有 TUI 并存，避免实验性 UI 影响日常使用。
- 作为测试维护者，我希望该入口能通过命令行 smoke 自动验证，而不是只能手工观察。

## 验收标准

- `agent-cli tui-ink` 和 `agent-cli --tui-ink` 可以启动 Ink/TSX 预览终端 UI。
- 预览 UI 至少展示标题、运行时状态、快捷键、guide 和 palette 摘要。
- 预览 UI 支持按 `q`、`Esc` 或 `Ctrl+C` 退出。
- `pnpm build` 能编译 `.tsx` 入口与组件。
- 单元测试覆盖 CLI dispatcher 新入口解析与 TSX snapshot 数据构造。
- smoke 测试可通过管道输入 `q` 验证入口输出。

## 风险

- Ink 依赖会扩大 CLI 包依赖体积。控制方式：只新增独立预览入口，不改变默认启动路径。
- 终端渲染在非 TTY 环境和 CI 管道下行为不同。控制方式：增加非交互输入退出路径和 smoke 验证。
- TSX 编译配置可能影响现有 TS 构建。控制方式：只开启标准 `react-jsx` 并把 include 扩展到 `src/**/*.tsx`。
