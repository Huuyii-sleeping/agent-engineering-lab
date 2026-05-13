# Delivery 交付验证模块边界收口

## 这次真正学到的东西
### 1. delivery 不是一个单纯的 tool handler，而是交付质量闭环的执行管线

`src/delivery.ts` 原来同时负责：
- delivery report / stage / failure 类型定义
- package script 探测
- stage plan 构建与 skip 条件
- command 执行、timeout、stdout/stderr 截断
- failure classify 与 retryable 判断
- stage / report observability 事件
- `.delivery/delivery_report.json` 读写
- tool-facing JSON 输出

这说明 Delivery 实际上是“验证计划 + 执行策略 + 报告持久化 + public facade”的组合。继续把这些逻辑堆在一个文件里，后续一旦新增验证阶段、调整 retry 或改变报告消费入口，就容易误碰现有 JSON shape。

### 2. 这块最自然的边界是 types / plan / runner / report-store / facade

这一轮拆完后，内部入口更明确：
- `delivery-types.ts`
  - 放 stage、failure、report、context、plan、options 类型
  - 放输出截断与 report summary 这类稳定 helper
- `delivery-plan.ts`
  - 放 package script 读取与 script 存在性判断
  - 放 stage 顺序、命令和 skip 条件
- `delivery-runner.ts`
  - 放 command execution、timeout、retry、failure classify
  - 放每个 stage 的 observability
- `delivery-report-store.ts`
  - 放 `.delivery` 路径、report 读取与写入
- `delivery.ts`
  - 只保留 public validation 编排、report 汇总和 tool JSON facade

这样后续如果要新增 stage，优先改 plan；如果要调整失败分类或重试，优先改 runner；如果要换 report 存储位置，优先改 report-store；如果要改工具输出契约，再改 facade。

## 放到本仓库里怎么理解
### 当前已经有的基础

- `delivery-quality-validation` spec 已经定义交付验证报告和失败分类的语义
- query finalization 已经能消费自动 delivery 结果
- observability runtime 已经记录 delivery stage 与 delivery report 事件
- smoke test 已经覆盖一次完整的 delivery pass 路径

### 当前最明显的差距

- 原 `delivery.ts` 聚合了计划、执行、报告存储和工具输出
- stage plan 的 skip 条件没有独立 focused tests
- failure classify / retryable 规则没有模块级测试锁定
- report store 路径和 JSON 落盘语义没有独立测试锁定

### 这轮只解决哪些差距

- 这轮要做的：拆 Delivery 内部边界，补 focused tests，新增沉淀文档
- 这轮不做的：不新增验证阶段，不调整 retry 次数，不改变 failure code，不改变 report schemaVersion 或 JSON shape

## 这轮采纳了什么
### 采纳

- 新增 `delivery-types.ts`

集中承接：
- `DeliveryStageName`
- `DeliveryFailureCode`
- `DeliveryStatus`
- `DeliveryFailure`
- `DeliveryStageResult`
- `DeliveryReport`
- `DeliveryContext`
- `DeliveryStagePlan`
- `DeliveryOptions`
- `truncateDeliveryOutput`
- `summarizeDeliveryReport`

- 新增 `delivery-plan.ts`

承接计划边界：
- `fileExistsInJsonScript`
- `readPackageScripts`
- `buildDeliveryPlan`

这里保留原 stage 顺序：
- `lint`
- `test`
- `build`
- `regression`
- `observability`
- `hooks`
- `recovery`
- `scheduler`

也保留原有 `apps/agent-cli/` touched path 才启用 agent-cli smoke stage 的语义。

- 新增 `delivery-runner.ts`

承接执行边界：
- command exec
- stdout/stderr 截断
- timeout 与瞬时错误分类
- retryable 判断
- stage observability event

- 新增 `delivery-report-store.ts`

承接报告持久化边界：
- `.delivery` 目录路径
- `delivery_report.json` 路径
- 最新 report 读取
- report JSON 写入

- 收窄 `delivery.ts`

现在 `delivery.ts` 主要保留：
- 兼容 public type exports
- `loadLatestDeliveryReport`
- `runDeliveryValidation`
- `runDeliveryValidateTool`
- `runDeliveryReportTool`

- 新增 focused tests

覆盖：
- script 探测、stage 顺序、command shape、agent-cli touched path skip 条件
- deterministic failure classify、timeout / transient / command missing 分类
- retryable 判断
- report store missing / save / load / trailing newline
- output truncate 与 report summary 文案

### 暂不采纳

- 暂不新增新的 delivery stage

这轮目标是边界收口，不是扩大验证覆盖。新增 stage 会改变运行时间、失败面和自动 delivery 体验，适合单独设计。

- 暂不改变 retry 策略

retry 次数来自 `RUNTIME_CONFIG.deliveryRetryMaxAttempts`，本轮只迁移原逻辑。是否对不同 stage 做差异化 retry，是后续执行策略问题。

- 暂不改变 report JSON shape

`.delivery/delivery_report.json` 已经可能被 query finalization、tool 输出和人工交接使用。边界拆分不应该夹带 schema 变更。

## 这轮实际改成了什么
- `delivery-types.ts` 承接共享类型与稳定 helper
- `delivery-plan.ts` 承接 package script 探测与 stage plan 构建
- `delivery-runner.ts` 承接 command 执行、failure classify、retry 和 stage observability
- `delivery-report-store.ts` 承接 report 路径与 JSON 读写
- `delivery.ts` 收成 public validation 编排与 tool facade
- 新增 focused unit tests 锁住拆分后最容易漂移的语义

改完之后，后续变更入口更明确：
- 调整 stage 选择或 skip 条件，优先改 `delivery-plan.ts`
- 调整失败分类、timeout 或 retry，优先改 `delivery-runner.ts`
- 调整 report 存储路径，优先改 `delivery-report-store.ts`
- 调整 public tool 输出，再改 `delivery.ts`

## 下一步最自然的动作
1. 继续查看 `apps/agent-cli/src/runtime/query-model.ts` 这类运行时策略文件是否还存在混合职责。
2. 评估 Delivery 是否需要更细的 stage-level policy，例如不同 stage 的 timeout / retry。
3. 如果后续要扩展 report schema，先单独开 PRD，明确兼容策略和迁移方式。
