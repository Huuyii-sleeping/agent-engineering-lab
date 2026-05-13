## Why

`src/delivery.ts` 是交付质量闭环的核心实现，但当前同时包含 stage plan、package script 探测、command runner、retry/failure classify、report store、observability 和 tool JSON facade。继续聚合会让后续调整验证阶段或报告格式时更容易误碰 public API。

本轮只拆内部边界，不改变交付验证行为。

## What Changes

- 新增 delivery 类型与 JSON 工具边界。
- 新增 delivery plan 模块，承接 package script 探测与 stage plan 构建。
- 新增 delivery runner 模块，承接 command execution、retry、failure classify 与 stage observability。
- 新增 delivery report store 模块，承接 report 读写路径。
- 更新 `delivery.ts` 为 public validation / tool facade。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 delivery 内部必须区分 plan、runner、report store 与 facade 的要求。
- `delivery-quality-validation`: 明确边界收口必须保持 stage plan、failure classify、retry 和 report shape 语义不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/delivery-types.ts`
  - `apps/agent-cli/src/delivery-plan.ts`
  - `apps/agent-cli/src/delivery-runner.ts`
  - `apps/agent-cli/src/delivery-report-store.ts`
  - `apps/agent-cli/src/delivery.ts`
  - focused delivery tests
- 影响文档：
  - 新增 `PRD-35`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见工具输出、report JSON shape、失败分类、retry 或自动验证行为。
