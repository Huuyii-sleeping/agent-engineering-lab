## Why

`ToolService` 已经成为 query runtime 的正式依赖，但它内部仍同时处理工具列表、metadata、preview 和执行分发。继续沿用这种形态会让后续新增工具来源、权限策略或注册协议时再次把职责集中到一个类里。

这一轮只在 `tools/` 内部拆清 catalog 与 executor，让 `ToolService` 退成 facade，不改变工具行为。

## What Changes

- 新增工具 catalog 模块，承载工具 registration、OpenAI tool schema 和 metadata。
- 新增工具 executor 模块，承载 preview 与工具执行分发。
- 更新 `ToolService` 以组合 catalog 和 executor。
- 保持 `ToolServiceLike`、`tools/index.ts` 和所有工具行为兼容。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加工具协议层内部必须区分 catalog 与 execution boundary 的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/catalog.ts`
  - `apps/agent-cli/src/tools/executor.ts`
  - `apps/agent-cli/src/tools/service.ts`
  - focused tool tests
- 影响文档：
  - 新增 `PRD-24`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、HTTP API、工具 schema 或工具输出。
