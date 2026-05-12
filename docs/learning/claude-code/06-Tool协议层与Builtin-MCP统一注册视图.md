# Tool 协议层与 Builtin-MCP 统一注册视图

## 这轮真正学到的东西

### 1. `ChatCompletionTool[]` 只是模型输入格式，不该充当完整工具协议层

前几轮我们已经把工具执行路径收口了，但继续对照源码边界时会发现一个问题：

- builtin tools 主要还是以 `ChatCompletionTool[] + handler` 存在
- MCP tools 已经长出了更像 registration 的结构
- service / runtime 侧有些地方还要从 OpenAI tool schema 里反推 metadata

这说明当前仓库虽然已经有工具运行时，但“工具协议层”还没有完全独立出来。

### 2. 真正稳定的工具边界，应该先有 registration，再导出给模型的 schema

这轮把 builtin 与 MCP 统一到 `ToolRegistration` 视图后，结构更清楚了：

- registration 负责表达工具身份、目标类型、replay 策略和远端映射
- `ChatCompletionTool` 只是 registration 对模型暴露时的投影
- service / registry / 路由都可以直接复用同一份协议元数据

这更接近源码里 `Tool` 不是“零散 schema”，而是正式协议层的思路。

### 3. builtin 和 MCP 到这里才开始真正站到同一层

之前 builtin 与 MCP 虽然都能执行，但边界形态不一致：

- builtin 更像本地数组和 handler
- MCP 更像动态 registration

这轮之后，两边都能通过统一 registration 视图暴露元信息，只是在执行来源上不同：

- `base`
- `subagent`
- `mcp`

## 这轮怎么映射到本仓库

### 原来的问题

- `tools/index.ts` 主要拼接 `ChatCompletionTool[]`
- builtin registry 还没有显式导出 registration 层
- `agent-service` 需要从 tool schema 反推工具元信息
- builtin 与 MCP 的元数据形态还不一致

### 这轮实际做的事

1. 新增 `tools/protocol.ts`
2. 定义统一 `ToolRegistration`
3. 让 builtin registry 显式导出 registration
4. 让 MCP registry 也导出同一形态的 registration
5. 让 `tools/index.ts` 统一提供：
   - `listToolRegistrations()`
   - `listToolMetadata()`
   - 基于 registration 投影出来的 `listTools()`
6. 让 `agent-service` 改为优先消费 registration 层元数据

## 本轮采纳了什么

### 采纳

- 把 tool protocol 和 OpenAI tool schema 分开
- 让 builtin / MCP 共享统一 registration 视图
- 把 replay-safe、target、remote mapping 视为正式工具元数据

### 暂不采纳

- 还没有把 subagent 内部的 `BASE_TOOLS` 循环进一步纳入更完整的 tool protocol
- 还没有把 `tool runtime` 与 `tool registration` 合成更显式的 Tool service
- 还没有继续把 query orchestrator 升成更显式的 `QueryEngine` 对象

原因是这一轮先处理最明显的协议层不一致，让工具层元数据先站稳。

## 到这里就先停

这轮完成后，工具层比之前更像正式协议，而不是若干 tool schema 的拼接。下一步更自然的是：

- 回到 `QueryEngine` 形态继续校正
- 或继续收口 tool service / registry 的服务边界
