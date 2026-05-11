## Context

当前工具调度链路分为两层：

- `src/tools/base.ts` 负责原生工具注册与执行
- `src/tools/index.ts` 在 base 之上补 `subagent_*` 分流

这种结构适合原生工具，但还没有“外部工具注册表”这个概念。`TOOLS` 目前是静态数组，`runToolByName` 目前只知道原生与子代理，意味着新增外部 server 时必须修改代码并重新拼接工具清单，这与 PRD-19 “新增 server 不改主循环”的目标相冲突。

同时，外部能力如果直接通过自定义脚本调用，还会绕过当前已有的：

- `enforceSecurityGate(...)`
- `recordObservabilityEvent(...)`
- 统一 `{ ok:false, error:{ code, message } }` 错误结构

因此本次需要把“外部工具”纳入同一个工具控制面，而不是另起一套执行通道。

## Goals / Non-Goals

**Goals**

- 提供最小 MCP stdio client，支持外部进程启动、初始化、列工具、调工具
- 让工具清单支持动态包含外部 MCP 工具，不需要改主循环代码
- 让 `runToolByName(...)` 在 native / subagent / MCP 三类工具间统一分流
- 让 MCP 工具经过与原生工具相同的安全门禁、观测链路和结构化错误包装
- 为 transport / lifecycle 故障提供有限重试与失效回收

**Non-Goals**

- 不实现完整插件市场、远程 registry 或商业化分发
- 不覆盖所有 MCP 能力面，只先支持 tools 能力
- 不在本 PRD 内引入复杂多租户隔离或持久化 session
- 不实现热更新 server 配置；进程内按配置变化重载即可

## Decisions

### 决策 1：采用最小 stdio JSON-RPC MCP client，而不是引入完整第三方 SDK

首版直接在仓库内实现最小 client，覆盖：

- 进程启动
- `initialize`
- `tools/list`
- `tools/call`
- 请求超时、退出处理与重启

选择原因：

- 当前仓库已经有自己的工具总线、安全和观测体系，首版更适合可控、最小依赖的实现
- PRD-19 验收只要求最小 MCP client 和统一 router，不要求完整生态 SDK

备选方案：

- 直接引入完整 MCP SDK
  - 不采用原因：范围扩大、依赖增加、调试复杂度更高，不利于当前阶段的小步交付

### 决策 2：外部 server 通过项目级 `.codex/mcp.json` 注册

配置文件记录 server 列表，每个 server 至少包含：

- `name`
- `command`
- `args`
- 可选 `env`
- 可选 `cwd`
- 可选 `enabled`

选择原因：

- 与现有 `.codex/hooks.json` 风格一致，属于项目级能力接入
- 新增 server 时只需要新增配置，不需要改主循环或工具数组源码

### 决策 3：MCP 工具在模型工具面中使用稳定前缀名

外部工具注册到模型时，统一转换为类似 `mcp__<server>__<tool>` 的函数名，同时保留描述中对真实 server / tool 的说明。

选择原因：

- 避免和原生工具重名
- router 可通过名字前缀快速识别为外部工具
- `/tools` 元信息和观测事件中可直接看出来源

### 决策 4：统一 router 采用“先 subagent，再 MCP，再 native”的显式分流

`runToolByName(...)` 扩展为：

1. 命中 `subagent_*`
2. 命中已注册 MCP 工具
3. 回退到 base/native

选择原因：

- `subagent_*` 本身不是外部 server，继续保留显式优先级
- MCP 工具集合是动态的，必须在 native fallback 之前判定

### 决策 5：MCP 工具默认进入安全策略边界，不允许裸奔

安全策略新增对 `mcp__` 前缀工具的匹配能力，默认要求审批，避免外部 server 成为绕开 native 工具边界的新后门。

选择原因：

- PRD 要求外部工具不能绕开权限边界
- 当前安全系统已经有审批、消费和审计链路，复用即可

### 决策 6：外部调用失败统一包装为结构化错误，并做有限重试

对以下故障做统一处理：

- server 启动失败
- 初始化失败
- 请求超时
- 进程异常退出
- `tools/call` 返回错误

返回统一结构，例如：

- `MCP_SERVER_START_FAILED`
- `MCP_TOOL_NOT_FOUND`
- `MCP_TOOL_CALL_FAILED`
- `MCP_PROTOCOL_ERROR`
- `MCP_REQUEST_TIMEOUT`

并对 transport / lifecycle 类故障执行有界重试，超过预算后失败。

## Risks / Trade-offs

- [Risk] 不同 server 返回的 `structuredContent` 形态不一致
  - Mitigation：首版仅承诺统一返回字符串；若返回 `structuredContent` 则优先回填 JSON，否则回填 text

- [Risk] 静态 `TOOLS` 改为动态加载后，CLI / HTTP service 入口需要同步调整
  - Mitigation：新增统一 `listTools()` 入口，主循环只消费解析后的工具数组

- [Risk] 默认要求审批会让 MCP 工具首次使用更繁琐
  - Mitigation：这是有意的安全默认；后续可通过项目策略显式放宽特定外部工具

- [Trade-off] 首版只支持 stdio tools，不支持 resources / prompts / sampling
  - Benefit：范围可控，能先把外部工具纳入统一控制面

## Migration Plan

1. 新增 MCP 配置解析、client 与 registry
2. 接入动态工具清单与统一 router
3. 为 `mcp__` 工具接入安全策略、观测与重试
4. 更新 CLI / HTTP service，使其从统一工具清单读取可用工具
5. 补单测、smoke 与文档

回滚策略：

- 若 MCP 集成导致不稳定，可移除 `.codex/mcp.json` 配置并回退到纯 native/subagent 工具面
- 由于主循环仍通过统一 router 工作，禁用外部配置后不影响既有原生流程
