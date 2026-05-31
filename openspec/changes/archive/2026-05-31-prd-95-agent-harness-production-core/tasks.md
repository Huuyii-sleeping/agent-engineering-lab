## 1. 测试先行

- [x] 1.1 增加 harness 单测，覆盖 OpenAI-compatible deterministic client 返回 assistant-only 响应。
- [x] 1.2 增加 harness 单测，覆盖 deterministic client 返回 tool calls、记录请求 metadata、脚本耗尽错误。
- [x] 1.3 增加 harness 单测，覆盖 `runHarnessAgentScenario` 可驱动真实 `QueryEngine` 完成 assistant-only round。
- [x] 1.4 增加 harness 单测，覆盖真实 tool-driven round 的 tool result 顺序和 runtime state。
- [x] 1.5 增加 harness 单测，覆盖 hook 阻断、模型错误和 scheduled notification 注入。
- [x] 1.6 增加 golden scenario 单测，覆盖只读工具并发顺序、写入工具串行、文件副作用和 observability 断言失败信息。

## 2. Deterministic Client 与模型适配

- [x] 2.1 新增 deterministic OpenAI client adapter，复用现有 `HarnessModelScriptItem`。
- [x] 2.2 支持 assistant content、tool_calls、模型错误、脚本耗尽错误的 OpenAI 响应形状。
- [x] 2.3 暴露请求记录，包含模型名、messages 摘要、tools 数量和可选 metadata。

## 3. Runtime Services Fixture

- [x] 3.1 新增 harness runtime state factory，生成生产 query engine 所需的最小 runtime state。
- [x] 3.2 新增 fake tool service，支持工具注册、执行记录、只读并发观察、写入串行观察和工具失败注入。
- [x] 3.3 新增 fake hook service，支持 `SessionStart`/stop-stage 调用记录和阻断注入。
- [x] 3.4 新增 fake memory、notification、observability、delivery、model policy、runtime coordination services。
- [x] 3.5 确保 fixture 不读写真实 `.memory`、`.observability`、`.schedule` 或外部系统。

## 4. Agent Scenario Runner

- [x] 4.1 新增 `runHarnessAgentScenario`，组装 workspace、deterministic client、runtime services、prompt source 和 `QueryEngine`。
- [x] 4.2 支持初始 messages、tools、scheduled notifications、hook 配置、tool fixtures 和 scenario timeout。
- [x] 4.3 返回结构化结果：status、failedStep、messages、runtimeState、toolRecords、hookRecords、observabilityEvents、modelRequests。
- [x] 4.4 增加结构化断言 helper，覆盖 assistant 内容、tool result 顺序、文件内容、runtime state、trace event、metric、blocked 状态。
- [x] 4.5 保持现有 `runHarnessScenario`、`withHarnessWorkspace`、`createDeterministicModel` API 兼容。

## 5. Golden Scenarios

- [x] 5.1 增加 assistant-only golden scenario。
- [x] 5.2 增加 read/write file tool flow golden scenario。
- [x] 5.3 增加 readonly parallel tool order golden scenario。
- [x] 5.4 增加 write-capable serial tool golden scenario。
- [x] 5.5 增加 hook blocked golden scenario。
- [x] 5.6 增加 model failure golden scenario。
- [x] 5.7 增加 scheduled notification injection golden scenario。

## 6. 验证与归档

- [x] 6.1 执行 harness 定向单测并修复失败。
- [x] 6.2 执行 `pnpm --dir apps/agent-cli test`。
- [x] 6.3 执行 `pnpm build`。
- [x] 6.4 执行 `openspec status --change "prd-95-agent-harness-production-core" --json` 与 `openspec validate "prd-95-agent-harness-production-core" --type change`。
- [x] 6.5 全部通过后归档 OpenSpec change 并本地提交。
