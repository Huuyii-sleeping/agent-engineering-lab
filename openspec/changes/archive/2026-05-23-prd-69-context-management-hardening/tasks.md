## 1. 配置与阈值

- [x] 1.1 在 `runtime-config.ts` 增加 context window、reserve、max completion token、compact min reduction 配置。
- [x] 1.2 在 `context-compact.ts` 增加有效压缩阈值计算函数并更新导出。

## 2. 压缩摘要与状态补偿

- [x] 2.1 扩展 `CompactRuntimeContext`，支持 session/runtime state 补偿。
- [x] 2.2 改造 compacted message，输出脱水摘要、session memory、保留消息与状态补偿信息。
- [x] 2.3 自动压缩时从 `runtimeState` 传入状态补偿数据。

## 3. 恢复熔断与模型请求

- [x] 3.1 preflight auto compact 后校验压缩收益，低收益时追加 recovery failure 并返回 `recovery_failed`。
- [x] 3.2 模型请求 `max_tokens` 改为读取运行时配置。

## 4. 测试与验证

- [x] 4.1 更新 context compact unit test，覆盖脱水摘要、状态补偿和有效阈值。
- [x] 4.2 更新 query model unit test，覆盖低收益熔断与 max_tokens 配置。
- [x] 4.3 新增或更新 smoke 测试，覆盖 PRD-69 核心路径。
- [x] 4.4 运行 OpenSpec validate、定向测试、agent-cli test 和 build。
