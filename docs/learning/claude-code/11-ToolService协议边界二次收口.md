# ToolService 协议边界二次收口

## 这次真正学到的东西

### 1. facade 稳定，不代表内部职责可以继续混在一起

PRD-23 已经把 `ToolService` 放进 `RuntimeServices`，这让 query runtime 的依赖表达稳定了。

但从工具层内部看，`ToolService` 仍同时做三类事情：

- 列出工具 registration、OpenAI schema 和 metadata
- 预览工具调用
- 按名称分发 builtin、subagent、MCP 工具执行

这些事情变化方向不同。工具来源和 metadata 会影响 catalog；权限、replay 和 handler 路由会影响 executor。继续放在一个类里，会让后续每次扩工具协议都先改 `ToolService`。

### 2. 第二轮收口应该只拆最能说明边界的部分

这轮没有迁移 `ToolService` 到 `services/`，也没有重写 `runtime/tool-runtime.ts`。

原因是当前真正的问题不是文件目录，而是 `tools/` 内部缺少 catalog 与 executor 的职责切分。先把这个边界拆清楚，比继续移动文件更有价值。

## 放到本仓库里怎么看

### 当前已经有的基础

- `tools/protocol.ts` 已经定义 `ToolRegistration`、OpenAI tool schema 转换和 metadata 转换。
- `tools/registry.ts` 已经统一 builtin base/subagent registration、preview 和 handler resolver。
- `runtime/tool-runtime.ts` 已经承接 replay dry-run、security gate 和目标识别。
- `ToolService` 已经是 query runtime 依赖中的稳定 facade。

### 当前最明显的差距

- catalog 逻辑和执行分发逻辑仍在 `ToolService` 同一层表达。
- 新增工具来源时容易碰到执行分发代码。
- 调整工具执行策略时容易碰到 schema/metadata 代码。

### 这轮只解决哪些差距

- 这轮要做的：拆出 `ToolCatalog` 与 `ToolExecutor`，让 `ToolService` 只组合两者。
- 这轮不做的：不迁移 `ToolService` 文件位置，不改变工具协议字段，不改变工具行为，不重写权限模型。

## 这轮采纳了什么

### 采纳

- 新增 `apps/agent-cli/src/tools/catalog.ts`

`ToolCatalog` 负责：

- `listToolRegistrations`
- `listTools`
- `listToolMetadata`

它组合 builtin registrations 与 MCP registrations，并复用 `toChatCompletionTool`、`toToolMetadata`。

- 新增 `apps/agent-cli/src/tools/executor.ts`

`ToolExecutor` 负责：

- `previewToolCall`
- `runToolByName`

它继续复用 `resolveToolExecution`、`executeProtectedToolHandler`、`runMcpToolByName` 和 builtin handler resolver。

- 保留 `apps/agent-cli/src/tools/service.ts`

`ToolService` 现在只持有 catalog 与 executor，保持 `ToolServiceLike` 对外契约不变。

### 暂不采纳

- 暂不把 `ToolService` 迁移到 `services/`

`ToolService` 面向 query runtime 是 service，但它的协议、registry、handler、MCP runner 都属于工具子系统。迁移文件位置会让目录看起来统一，但会模糊工具协议层的归属。

- 暂不拆 `runtime/tool-runtime.ts`

`runtime/tool-runtime.ts` 当前更像通用执行保护层，负责 replay dry-run、security gate、参数解析和 target 识别。builtin/MCP handler 分发才属于 tools executor。

- 暂不改变 `tools/index.ts`

`tools/index.ts` 仍作为默认 `ToolService` 的薄包装，保证老调用方不用感知内部拆分。

## 这轮实际改成了什么

- `tools/catalog.ts` 承接 registration/schema/metadata。
- `tools/executor.ts` 承接 preview/run dispatch。
- `tools/service.ts` 退成 catalog + executor facade。
- focused tests 覆盖 catalog 投影、executor 分发和 facade 组合。

改完之后，后续变更入口更清楚：

- 新增工具来源或 metadata 规则，优先改 `ToolCatalog`。
- 调整 builtin、subagent、MCP 执行路由，优先改 `ToolExecutor`。
- query runtime 继续只依赖 `ToolServiceLike`。

## 下一步最自然的动作

1. 观察 `ToolExecutor` 是否还需要进一步拆出 MCP executor 或 builtin executor。
2. 等工具执行策略继续增长时，再评估 security/replay policy 是否需要独立 policy service。
3. 在 Web 展示接入前，先稳定 runtime services 与 tool services 的边界命名。
