# 运行时 Service 目录与边界校正

## 这次真正学到的东西

### 1. service 显式化之后，还需要稳定目录边界

上一轮已经把 `QueryEngine` 周围的横切依赖拆成了明确 service，但如果这些 service 继续平铺在 `src/` 根目录，调用方仍然要理解一组零散文件。

外部源码更值得学的是分层稳定性：入口负责启动，bootstrap 负责装配，query 负责执行骨架，tools 负责工具协议，services 承载跨阶段运行时能力。

### 2. 目录收口不是为了好看，而是为了压低后续接入成本

CLI、HTTP service 和未来 Web 如果都要共享同一套 runtime，就需要一个稳定 service 边界。否则每新增一个 service，入口和 query runtime 都会继续扩散 import。

这轮先把应用级 runtime service 收进 `services/`，让后续新增横切能力时有明确归属。

## 放到本仓库里怎么看

### 当前已经有的基础

- `QueryEngine` 已经是正式运行时对象
- `ToolService / DeliveryService / HookService / ObservabilityService / ModelPolicyService / MemoryService / NotificationService / RuntimeCoordinationService` 已经显式化
- `bootstrap/app-runtime.ts` 已经承担 composition root 角色

### 当前最明显的差距

- 多个应用级 service 仍在 `src/` 根目录
- `bootstrap` 和 `query` 需要分别 import 一组 service 文件
- 新增 runtime service 时缺少默认目录规则

### 这轮只解决哪些差距

- 这轮要做的：建立 `src/services/`，迁移应用级 runtime service，提供聚合导出入口
- 这轮不做的：不迁移 `tools/service.ts`，不重写 `QueryEngine`，不改变任何运行语义

## 这轮采纳了什么

### 采纳

- 应用级 runtime service 进入 `apps/agent-cli/src/services/`
- 核心装配路径通过 `services/index.ts` 引用 service 类型和默认实例
- 保留现有 class、type、默认实例命名，降低行为变化风险

### 暂不采纳

- 暂不迁移 `ToolService`

原因是它同时承担工具协议层门面，和 `tools/protocol.ts`、`tools/registry.ts`、具体工具 handler 更接近。后续如果要继续收工具层，可以单独做一轮。

- 暂不增加旧路径 shim

原因是这些 service 路径属于内部模块，仓库内引用可以一次性更新；保留 shim 会让新旧边界并存。

## 这轮实际改成了什么

- 新增 `apps/agent-cli/src/services/`
- 迁移 delivery、hook、memory、model policy、notification、observability、runtime coordination service
- 新增 `services/index.ts`
- 更新 bootstrap、query runtime、agent service、CLI、base tools、subagent 的 service import

改完之后，`QueryEngine` 周围的横切依赖开始有统一应用级 service 边界，后续继续收 state、task 或 session 相关能力时更容易判断归属。

## 下一步最自然的动作

1. 继续观察 `QueryEngine` 依赖是否需要形成更明确的 `RuntimeServices` 对象。
2. 单独评估 `ToolService` 与 `tools/` 内部协议层是否需要第二轮收口。
3. 等 runtime 结构进一步稳定后，再推进 Web 展示接入。
