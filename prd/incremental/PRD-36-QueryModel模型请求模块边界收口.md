# PRD-36 QueryModel 模型请求模块边界收口

## 背景

`apps/agent-cli/src/runtime/query-model.ts` 当前同时承载 prompt envelope 组装、请求消息构造、token preflight、自动 compact、model policy selection、主模型请求、fallback retry、response recovery、transport recovery 与 observability 事件。随着模型策略、恢复策略和请求链路继续演进，这个文件需要先把内部边界拆清楚。

## 目标

- 拆出 query model types / shared helpers。
- 拆出 query model request 边界，承接 request message 构造、文本摘要、OpenAI request 调用和 response 归一化。
- 拆出 query model recovery 边界，承接 recovery failure 记录、preflight compact、response recovery 与 error recovery 的公共动作。
- 拆出 query model fallback 边界，承接 fallback selection、fallback model request 与 usage finalize。
- 收窄 `query-model.ts` 为 public orchestration facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `requestQueryModel` public API。
- 不改变 prompt envelope、request messages 顺序或 continuation prompt 语义。
- 不改变 model policy selection、budget deny、fallback once、usage finalize 语义。
- 不改变 recovery decision、compact、backoff、failure message 或 stopReason 语义。

## 验收标准

1. `query-model.ts` 不再直接承载 request、fallback、recovery 的全部细节。
2. focused tests 覆盖：
   - request message 构造与摘要 helper。
   - fallback request 成功 / 空响应路径。
   - recovery failure append 与 preflight compact 结果。
3. 原有 `query-model.test.ts` 继续通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
