## Why

当前 `agent-cli tui` 已实现较多本地交互能力，但主要通过手写字符串和 ANSI renderer 组织 UI。用户希望实现类似 Claude Code 源码中 TSX 组件化终端交互的效果，因此需要先提供一个可验证、可并存的 Ink/TSX 预览入口，为后续渐进迁移建立工程样板。

## What Changes

- 新增 `agent-cli tui-ink` / `agent-cli --tui-ink` 预览入口，用 Ink/React/TSX 渲染终端 UI。
- 新增终端 UI 组件模块，展示 dashboard、runtime 状态、快捷键、guide 和 palette 摘要。
- 扩展 TypeScript 配置以编译 `.tsx`。
- 新增测试覆盖入口解析、预览数据构造和 smoke 退出。

### In Scope

- 独立 Ink/TSX 预览入口。
- React/Ink 依赖与 TSX 编译配置。
- 复用现有 CLI UI / palette 信息构造预览内容。
- 单元测试和 smoke 测试。

### Out of Scope

- 不替换现有 `agent-cli tui`。
- 不迁移现有 raw keypress 全量交互逻辑。
- 不实现完整会话执行、模型请求或 palette 执行能力。
- 不新增 Web UI 或 Electron UI。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: TUI 交互面允许通过独立 Ink/TSX 预览入口验证组件化终端 UI，并必须与现有 TUI 并存。

## Impact

- 影响代码：`apps/agent-cli/src/entrypoints/cli-dispatcher.ts`、新增 Ink/TSX 入口与组件模块。
- 影响配置：`apps/agent-cli/package.json`、`apps/agent-cli/tsconfig.json`、锁文件。
- 影响测试：CLI dispatcher 单元测试、TSX 预览数据单元测试、PRD-80 smoke。
- 新增依赖：`react`、`ink`，开发依赖 `@types/react`。
