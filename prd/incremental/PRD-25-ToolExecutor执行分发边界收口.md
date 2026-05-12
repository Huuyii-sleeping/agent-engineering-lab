# PRD-25 ToolExecutor 执行分发边界收口

## 目标

在 PRD-24 已经把 `ToolService` 拆成 catalog 与 executor facade 后，继续收口 `ToolExecutor` 内部职责：让它只负责根据工具 target 分发执行，而不是同时承载 builtin/subagent handler 解析、MCP runner fallback 和保护执行细节。

本阶段不改变工具行为、工具 schema、权限、replay dry-run 或 MCP 调用语义，只在 `tools/` 内部拆出 builtin executor 与 MCP executor，为后续单独扩展执行策略打基础。

## 范围（In Scope）

- 新增 builtin executor 边界，负责 builtin/subagent preview 与 protected handler execution。
- 新增 MCP executor 边界，负责 MCP 工具 protected execution 与 unknown fallback。
- 更新 `ToolExecutor` 为 target dispatch facade。
- 更新或新增 focused tests。
- 新增本轮中文学习沉淀文档。

## 非目标（Out of Scope）

- 不改变 `ToolServiceLike`、`ToolExecutorLike` 或 `tools/index.ts` 对外契约。
- 不改变 `ToolRegistration` 协议字段。
- 不改变 `runtime/tool-runtime.ts` 的 replay/security gate 行为。
- 不拆 MCP client/registry 实现。
- 不迁移工具层文件到 `services/`。

## 功能要求

- `ToolExecutor` 必须主要表达 target dispatch，而不是直接写 builtin/MCP 执行细节。
- builtin/subagent 执行逻辑必须由独立内部边界承载。
- MCP 执行逻辑必须由独立内部边界承载。
- unknown tool、replay dry-run、security gate、handler exception 输出必须保持兼容。

## 验收标准（AC）

- AC-25-1：新增 builtin executor 或等效模块，负责 builtin/subagent preview 与执行。
- AC-25-2：新增 MCP executor 或等效模块，负责 MCP protected execution。
- AC-25-3：`ToolExecutor` 只做 target 解析与 executor dispatch。
- AC-25-4：focused unit tests、build 和 OpenSpec strict 校验通过。
- AC-25-5：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 拆出 builtin executor 与 MCP executor。
3. 更新 `ToolExecutor` 和 focused tests。
4. 运行验证，补学习沉淀并归档 change。
