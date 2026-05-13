# PRD-35 Delivery 交付验证模块边界收口

## 背景

`apps/agent-cli/src/delivery.ts` 同时承载交付阶段计划构建、package script 探测、命令执行与重试、失败分类、报告落盘、观测事件和 tool-facing JSON 输出。随着交付验证继续扩展阶段、策略和报告消费方，这个文件需要先拆清内部边界。

## 目标

- 拆出 delivery types / JSON helper。
- 拆出 delivery plan，承接 package script 探测与 stage plan 构建。
- 拆出 delivery runner，承接命令执行、重试、失败分类与 stage observability。
- 拆出 delivery report store，承接 `.delivery/delivery_report.json` 读写。
- 收窄 `delivery.ts` 为 public validation / tool facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 delivery report schemaVersion。
- 不改变 stage 列表、跳过条件、失败分类 code、重试语义或 report JSON shape。
- 不改变 `runDeliveryValidation`、`loadLatestDeliveryReport`、`runDeliveryValidateTool`、`runDeliveryReportTool` 导出契约。

## 验收标准

1. `delivery.ts` 不再直接承载 plan、runner、report store 的全部细节。
2. focused tests 覆盖：
   - package script 探测与 plan skip 条件。
   - failure classify 与 retryable 判断。
   - report store 读写。
   - public facade 的 pass/fail/report-not-found 输出。
3. 原有 delivery unit / smoke 行为保持通过，或记录已存在的环境性限制。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
