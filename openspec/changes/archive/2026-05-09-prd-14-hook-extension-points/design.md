## Context

当前项目已经具备安全、记忆、可观测性、子代理、后台任务等多类能力，但这些能力的接入方式并不统一。尤其是安全检查、工具前后扩展、运行时附加消息等逻辑，天然属于“横切关注点”，继续直接堆叠在主循环分支里，会导致：

- 主循环越来越难读
- 工具执行链越来越多 if/else
- 新增一类横切能力时，需要重复修改多个核心入口

PRD-14 的目标不是一次性把所有横切逻辑重构完，而是先建立“统一扩展点”基础设施，并尽量贴近当前公开 Codex hooks 的形态：项目级 `hooks.json`、事件名驱动、matcher 过滤、命令型 hook 进程、JSON stdin/stdout 契约。这里对“真实 Codex hook” 的贴近，是基于公开仓库 issue 中对现有 hooks engine 的描述，以及公开第三方集成文档中展示的配置格式与事件名做出的实现推断。

## Goals / Non-Goals

**Goals:**

- 引入独立 hooks 组件，以 `HookRunner` 作为统一扩展入口
- 明确最小 Hook 事件面和执行时机
- 统一 Hook 返回结构，避免布尔值、字符串、异常混用
- 让主循环和工具执行链从“内嵌横切逻辑”转为“触发 hooks 组件”

**Non-Goals:**

- 一次性把所有已有逻辑全部迁移到 Hook
- 引入复杂插件 DSL 或跨进程 Hook 市场
- 建立几十种事件类型

## Decisions

### 1. 采用项目级 `.codex/hooks.json` 配置，而不是把 hook 写死在代码里

- 方案 A：完全写死内建 hook
- 方案 B：读取项目级 `.codex/hooks.json`

选择 B。

原因：

- 更贴近当前公开 Codex hook 配置形态。
- 用户可按项目定制，而不是改源码。

不采用 A 的原因：

- 不能体现“真实 hook 使用姿势”，也不利于后续迁移和验证。

### 2. hooks 必须是独立组件，而不是主循环内部子模块

- 方案 A：把 hook 逻辑内嵌进 `agent-loop.ts`
- 方案 B：拆成独立 `src/hooks/` 组件，对主循环只暴露薄入口

选择 B。

原因：

- 更符合 hooks 作为 runtime middleware 的定位。
- 后续 `PRD-10/16/19` 都会复用，不应依赖 `agent-loop` 私有实现。
- 主循环只需要知道“在这里触发事件”，不需要知道配置文件结构或命令进程细节。

不采用 A 的原因：

- 会把 `agent-loop` 再次变成横切逻辑汇聚点。

### 3. hook 先只支持 `type=command`，通过 stdin/stdout JSON 交互

- 方案 A：支持多种 hook 类型（JS/TS 函数、shell、HTTP）
- 方案 B：首期只支持命令型 hook

选择 B。

原因：

- 这是目前公开可见的 Codex hooks 最稳定的使用方式。
- 更容易和本地脚本、lint、审计、日志上传工具集成。

不采用 A 的原因：

- 类型面过宽，会把 PRD-14 从“运行时骨架”膨胀成插件平台。

### 4. Hook 返回值使用结构化 Action，而不是抛异常驱动流程

- 方案 A：Hook 通过抛异常中断主流程
- 方案 B：Hook 返回结构化结果，由调用方决定继续、阻止还是注入消息

选择 B。

原因：

- 主循环更容易保持可读，执行路径更可观测。
- 也更适合后续接入 observability 和 replay。

不采用 A 的原因：

- 异常语义太粗，会把“预期阻止”和“真正错误”混在一起。

### 5. 事件面贴近公开 Codex 形态：`SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop`

- 方案 A：只保留三类最小事件
- 方案 B：直接对齐公开可见事件名

选择 B。

原因：

- `UserPromptSubmit` 和 `Stop` 都是实际使用里很常见的边界点。
- 更有利于后续接入 transcript capture、prompt 审计、结果上传。

不采用 A 的原因：

- 虽然更小，但和真实使用形态偏差太大。

### 6. matcher 先支持按事件组和工具名过滤，不做复杂表达式语言

- 方案 A：直接支持类似 DSL 的复杂 matcher 表达式
- 方案 B：首期支持最常用的 tool name matcher

选择 B。

原因：

- 足够覆盖 `PreToolUse/PostToolUse` 的主场景。
- 实现简单，便于先把事件流和 hook 进程协议稳定下来。

不采用 A 的原因：

- 表达式求值器会显著增加实现复杂度和安全面。

## Risks / Trade-offs

- [迁移不彻底] → 首期允许 hook 与旧逻辑共存，但新增横切逻辑优先走 hook
- [hook 顺序不明确] → 通过配置顺序和统一结果归并语义控制
- [命令型 hook 执行失败] → 默认记录错误并继续，只有显式 block 才会中止主流程
- [matcher 能力偏弱] → 首期接受只按工具名过滤，后续再扩展表达式

## Migration Plan

1. 新增独立 `src/hooks/` 组件，包含 `types/config/command-hook/runner/index`
2. 接入 `.codex/hooks.json` 配置读取
3. 在主循环接入 `SessionStart / UserPromptSubmit / Stop`
4. 在工具执行前后接入 `PreToolUse / PostToolUse`
5. 支持命令型 hook 的 JSON stdin/stdout 契约
6. 迁移至少一类现有横切逻辑作为示例
7. 补 smoke 和回归验证

## Open Questions

- hook 是否需要支持优先级与短路语义
  - 当前决定：首期按配置顺序执行，支持结构化阻止
- matcher 是否需要支持复杂表达式
  - 当前决定：首期先只支持 tool name matcher
- hook 是否需要对模型可见
  - 当前决定：不直接暴露为模型工具，保持为内部 runtime 能力
