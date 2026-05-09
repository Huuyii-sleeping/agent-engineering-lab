## Why

当前 Agent 的安全拦截、观测记录、后续恢复与扩展逻辑主要散落在主循环和工具执行链路中。继续直接在这些入口上叠加横切逻辑，会让主流程越来越难维护，也会提高新增能力的接入成本。

## What Changes

- 新增接近真实 Codex 的 Hook 配置模型：项目级 `.codex/hooks.json`。
- 新增独立 hooks 组件：负责事件分发、matcher 过滤、命令型 hook 执行与结果归并。
- 新增首批事件面：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`。
- 新增标准 hook stdin/stdout JSON 契约，供外部脚本消费。
- 改造主循环与工具入口：从直接写死逻辑，过渡为固定时机触发 hook。
- 将现有适合抽象的横切逻辑逐步迁入 hook 机制，降低主循环复杂度。

## Capabilities

### New Capabilities
- `hook-extension-points`: 统一 Hook 事件模型、注册机制、执行时机与结果归并

### Modified Capabilities
- `core-agent-loop`: 主循环在固定节点触发 Hook，并接受 Hook 对执行流程的结构化影响

## Impact

- 影响代码目录：`src/agent-loop.ts`、`src/tools/index.ts`、`src/tools/base.ts`
- 新增独立 hooks 组件相关模块
- 新增项目级 hook 配置文件读取
- 影响后续能力接入方式：安全、观测、恢复等横切逻辑优先通过 Hook 扩展
