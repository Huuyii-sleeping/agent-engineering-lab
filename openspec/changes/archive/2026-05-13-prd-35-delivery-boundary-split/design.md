## Context

当前 `src/delivery.ts` 的职责包括：

- delivery 类型定义
- package script 探测
- stage plan 构建
- execFile command 运行
- failure classify 与 retryable 判断
- stage observability event
- report summary、risks、suggestions 构造
- `.delivery/delivery_report.json` 读写
- tool-facing JSON 输出

Delivery 是交付质量闭环的基础能力，后续很可能继续增加验证阶段、策略和报告消费入口。因此需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 delivery plan 边界。
- 拆出 delivery runner 边界。
- 拆出 delivery report store 边界。
- 让 `delivery.ts` 只做 public validation 编排和 tool facade。
- 保持 delivery 行为兼容。

**Non-Goals:**

- 不改变 stage 列表或 skip 条件。
- 不改变 failure code、suggestion 或 retryable 规则。
- 不改变 report schemaVersion 或 JSON shape。
- 不改变 public exports。

## Decisions

### Decision 1: 新增 `delivery-types.ts`

采纳：

- 集中 DeliveryStageName、DeliveryFailure、DeliveryStageResult、DeliveryReport、DeliveryStagePlan、DeliveryOptions 等类型。
- 集中 `truncate`、`summarizeDeliveryReport` 这类稳定 helper。

备选方案：

- 每个模块分别定义类型。

不采用原因：

- plan、runner、report store 和 facade 都需要共享 report/stage shape；分散定义容易导致输出漂移。

### Decision 2: 新增 `delivery-plan.ts`

采纳：

- plan 模块负责读取 package scripts、判断 script 是否存在和构建 stage plan。
- plan 不执行命令，也不写 report。

备选方案：

- runner 内部直接构建 plan。

不采用原因：

- stage 选择是独立策略边界，后续新增阶段时优先改 plan。

### Decision 3: 新增 `delivery-runner.ts`

采纳：

- runner 负责 execFile command、failure classify、retryable 判断和 stage observability。
- runner 输出 `DeliveryStageResult`，不负责总 report 落盘。

备选方案：

- facade 直接执行每个 stage。

不采用原因：

- retry 和 failure classify 是执行策略，独立后更容易测试和扩展。

### Decision 4: 新增 `delivery-report-store.ts`

采纳：

- report store 负责 `.delivery/delivery_report.json` 路径、读写和目录初始化。
- facade 负责构造 report，store 只做持久化。

备选方案：

- report store 同时构造 summary。

不采用原因：

- summary 属于 validation 编排结果，store 只表达持久化边界更清晰。

## Risks / Trade-offs

- [Risk] stage plan skip 条件漂移 → Mitigation：focused tests 覆盖 touched `apps/agent-cli` 与 root script detection。
- [Risk] failure classify 或 retry 输出改变 → Mitigation：focused tests 覆盖 code/suggestion 和 retryable。
- [Risk] report path 或 JSON shape 改变 → Mitigation：report store tests 与原 delivery unit / smoke 覆盖。
