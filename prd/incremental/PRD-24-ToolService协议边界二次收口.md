# PRD-24 ToolService 协议边界二次收口

## 目标

在 PRD-23 已经把 `ToolService` 作为 query runtime 依赖纳入 `RuntimeServices` 后，继续收口 `tools/` 内部协议层，让 `ToolService` 退成清晰 facade，而不是同时承载工具目录、metadata 转换、预览和执行分发。

本阶段不改变工具行为、不迁移 `ToolService` 文件位置，只在 `tools/` 内部把工具 catalog 和执行器边界拆清楚，为后续权限、注册来源和工具协议扩展打基础。

## 范围（In Scope）

- 新增工具 catalog 边界，负责工具 registration、OpenAI tool schema、metadata 列表。
- 新增工具 executor 边界，负责 preview 和按名称执行工具。
- 让 `ToolService` 组合 catalog 与 executor，保持现有对外方法不变。
- 更新或新增 focused tests。
- 新增本轮中文学习沉淀文档。

## 非目标（Out of Scope）

- 不改变 `BASE_TOOLS`、`SUBAGENT_TOOLS`、MCP 工具注册来源。
- 不改变工具 schema、工具名称、执行输出或 replay/security 行为。
- 不迁移 `ToolService` 到 `services/`。
- 不重写工具权限模型。
- 不开始 Web 展示接入。

## 功能要求

- 工具发现和工具执行必须由不同的内部边界承载。
- `ToolServiceLike` 对外契约保持兼容。
- `tools/index.ts` 继续作为默认 `ToolService` 的薄包装。
- 本轮必须沉淀文档说明为何只拆 catalog/executor，而不迁移 `ToolService`。

## 验收标准（AC）

- AC-24-1：`tools/catalog.ts` 或等效模块负责 registration/schema/metadata。
- AC-24-2：`tools/executor.ts` 或等效模块负责 preview/run dispatch。
- AC-24-3：`ToolService` 仅组合 catalog 与 executor，对外方法保持不变。
- AC-24-4：focused unit tests、build 和 OpenSpec strict 校验通过。
- AC-24-5：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 拆出工具 catalog 和 executor。
3. 更新 `ToolService` 与 focused tests。
4. 运行验证，补学习沉淀并归档 change。
