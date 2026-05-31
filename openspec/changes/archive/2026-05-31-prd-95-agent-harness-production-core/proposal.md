## Why

当前 harness 只覆盖临时 workspace、deterministic model 和简单结构化步骤，能证明测试辅助能力，但还不能证明 agent runtime 的真实生产行为。下一阶段需要先把 harness 做成生产级验收层，用它稳定验证 query loop、工具调用、权限、安全、观测、恢复和回归场景，避免后续基础能力只能靠人工判断。

## What Changes

In Scope:
- 增强 `agent-cli-test-harness`，支持直接驱动真实 `QueryEngine` 的端到端场景。
- 增加 OpenAI 兼容 deterministic client adapter，按脚本返回 assistant 文本、tool calls、模型错误和截断类失败。
- 增加 harness runtime fixture，统一注入 tool、hook、memory、notification、observability、delivery、model policy 等 fake service。
- 增加结构化断言能力，覆盖 assistant 输出、tool result 顺序、文件副作用、runtime state、trace event、metrics、approval/blocked 结果。
- 增加故障注入能力，覆盖模型失败、工具失败、hook 阻断、secret output、delivery failure、scenario timeout。
- 增加一组 golden scenarios，至少覆盖“读写文件工具链”“只读工具并发顺序”“写入工具串行”“权限阻断”“模型失败恢复”“scheduler prompt 注入”。
- 保持现有 harness API 向后兼容，已有 workspace/model/scenario 单测继续通过。

Out of Scope:
- 不接入真实 OpenAI/Claude 模型服务。
- 不实现远端分布式 harness runner。
- 不引入浏览器 UI 或 dashboard。
- 不重写 query engine、工具系统、权限系统或 observability 的生产逻辑。
- 不把 harness 变成独立测试框架包，本轮只服务 `apps/agent-cli`。

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-cli-test-harness`: 从基础测试 fixture 扩展为可驱动真实 agent query loop 的生产级本地验收 harness。

## Impact

- 影响 `apps/agent-cli/test/harness/**`，新增 query-engine scenario runner、fake runtime services、deterministic OpenAI client adapter 和断言工具。
- 影响 `apps/agent-cli/test/unit/harness/**`，扩展 harness 单测与 golden scenario 测试。
- 可能少量影响 `apps/agent-cli/src/runtime/**` 的类型导出或依赖注入边界，但不改变生产行为。
- 更新 `openspec/specs/agent-cli-test-harness/spec.md` 的能力要求。
- 不新增运行时依赖；如确需测试辅助依赖，必须先在设计中说明并保持最小化。
