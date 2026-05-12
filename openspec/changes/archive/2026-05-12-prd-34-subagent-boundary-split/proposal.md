## Why

`tools/subagent.ts` 现在把子代理生命周期、状态记录、模型策略选择、tool-calling 循环、通知队列和 observability 编排混在一个文件里。随着 tools 层连续完成边界收口，这个模块已经成为剩余最显著的高耦合状态面之一。

本轮只收口 `subagent` 内部边界，不改变对外工具契约和主循环通知语义。

## What Changes

- 新增 subagent shared types / JSON helper 边界
- 新增 subagent executor 边界，承接模型调用、fallback 与 tool loop
- 新增 subagent manager 边界，承接生命周期、状态流转、wait、通知与 observability
- 收窄 `tools/subagent.ts` 为 tool schema、默认 manager 与兼容导出 facade
- 新增 focused tests 与中文学习沉淀文档

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 增加 subagent 工具内部需要区分 executor、manager 与 tool facade 的边界要求。
- `subagent-collaboration`: 增加子代理生命周期边界重构必须保持生命周期工具语义、通知语义与错误契约不变的要求。
- `subagent-tool-execution`: 增加子代理执行边界重构必须保持 base tools、tool loop、model policy 与 fallback 语义不变的要求。
- `architecture-learning-knowledge-base`: 要求本轮 subagent 边界校正同步新增中文学习沉淀文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/subagent.ts`
  - 新增 subagent executor / manager / types 模块
  - subagent focused tests
- 影响文档：
  - 新增 `PRD-34`
  - 新增 OpenSpec change
  - 新增中文学习沉淀文档
- 不改变用户可见的子代理工具契约、通知注入语义或 observability 事件阶段。
