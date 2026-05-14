## ADDED Requirements

### Requirement: CLI local interaction internals MUST live under a dedicated module subtree
CLI 本地交互模块 MUST 具备独立目录边界，避免交互表面内部实现继续散落在应用根层源码目录。

#### Scenario: Maintainer reads the source root
- **WHEN** 维护者阅读 `apps/agent-cli/src/`
- **THEN** 应能明确区分应用级入口/组合根文件与 CLI 本地交互模块
- **AND** CLI 命令、renderer、palette、completion、workflow、permissions 等本地交互实现位于专门的 `cli/` 子目录，而不是持续平铺在 `src/` 根层

#### Scenario: Entry surfaces reuse the dedicated CLI subtree
- **WHEN** CLI 或 TUI 入口需要复用本地交互能力
- **THEN** 它们通过 `cli/` 子目录中的稳定模块引用命令、UI、palette、completion 等能力
- **AND** 不要求调用方继续依赖散落在 `src/` 根层的 `cli-*` 文件路径
