## Context

当前 `apps/agent-cli` 的模型输入组装分散在多个入口：

- `src/config.ts` 中维护基础 `SYSTEM` 字符串
- `src/agent-loop.ts` 中直接插入 memory 注入、团队通知、后台通知、subagent 通知和临时 reminder
- hooks 可以在 `SessionStart` / `PostToolUse` / `Stop` 等阶段继续追加 system messages

这种实现虽然能工作，但 system 输入来源已经失去统一边界：稳定规则、动态提醒、运行时通知和临时上下文都在不同层拼接，后续继续接入调度、重试、MCP 和更多长期规则时会快速失控。

PRD-15 的目标不是引入复杂 prompt DSL，而是先建立一套工程化的 prompt 组装流水线，让每类输入有明确来源、职责和测试边界。

## Goals / Non-Goals

**Goals:**

- 抽出独立的 `SystemPromptBuilder` 或等效模块，集中负责 system 输入组装
- 将输入来源划分为稳定 sections 与动态 sections，并显式定义顺序
- 让 memory、skills、长期规则和动态上下文都通过统一 builder 进入模型请求
- 保留现有 hooks、notifications、memory 等能力的行为兼容
- 让每个 section 的生成逻辑可以单独测试，最终组装结果也可验证

**Non-Goals:**

- 不实现复杂 prompt 模板 DSL
- 不引入 prompt 缓存、成本治理或多模型 prompt 变体策略
- 不在本 PRD 内重写 hooks 体系、memory 检索算法或 team/background/subagent 能力本身

## Decisions

### 决策 1：新增 `src/prompt/` 模块，集中管理 prompt sections

采用一个新的 prompt 模块，例如：

- `src/prompt/types.ts`
- `src/prompt/sections.ts`
- `src/prompt/builder.ts`

由 builder 接收运行时输入，返回统一的 prompt 组装结果。

选择原因：

- 这是跨 `config.ts`、`agent-loop.ts`、memory、hooks 的横切改动，需要独立边界
- 将 prompt 结构收敛到单一模块后，后续接入 PRD-16/17/19 时不会继续污染主循环

备选方案：

- 继续在 `agent-loop.ts` 内提几个辅助函数
  - 不采用原因：边界仍然附着在主循环，后续来源一多仍会退化成分散拼接

### 决策 2：builder 输出拆成“主 system prompt + supplemental system messages”两层

builder 不把所有内容拼成一个字符串，而是输出两类结果：

- `primarySystemPrompt`：稳定规则 section 的拼装结果
- `systemMessages`：动态上下文、memory、notifications、hooks 注入的 system messages

选择原因：

- 稳定规则天然适合合并成单个主 prompt，便于阅读和测试
- memory、notifications、scheduled prompt 这类内容具有强运行时语义，保留为独立 system message 更清晰
- 能避免“为了统一而统一”，把本来有边界的动态内容重新压平

备选方案：

- 全部拼成一个大字符串
  - 不采用原因：会重新制造 PRD-15 要解决的问题，动态 section 难测试、难观察、难追加

### 决策 3：稳定 sections 采用显式注册顺序，不做动态优先级系统

首版 section 顺序固定为：

1. core
2. tools
3. skills
4. long-term rules
5. memory summary（若设计为稳定摘要）
6. dynamic context / supplemental messages

实际实现中，memory 命中内容和 notifications 仍落到 supplemental messages，而不是强制进入主 prompt。

选择原因：

- PRD-15 关注的是清晰流水线，不是优先级调度框架
- 固定顺序更容易回归测试，也更贴近当前仓库阶段

备选方案：

- 做可排序插件式 section priority
  - 不采用原因：复杂度过早，且当前没有真实需求支撑

### 决策 4：`config.ts` 不再暴露单一 `SYSTEM` 常量，改为暴露稳定 section 来源

当前 `SYSTEM` 常量将下沉为 core section 数据源，由 builder 负责最终拼装。

选择原因：

- 避免“外面还有一个 SYSTEM，里面再有一个 builder”的双真相
- 让 `createClient` 保持配置职责，prompt 相关职责转移到 prompt 模块

备选方案：

- 保留 `SYSTEM` 常量，并让 builder 在外层包它
  - 不采用原因：仍然保留两个 prompt 入口，后续容易再次漂移

### 决策 5：notifications 与 hooks 的现有语义保持兼容，但接入 builder 边界

`subagent/team/background` 通知和 hooks 产生的 system messages 仍然是 system message，只是改为通过 builder 统一收集与返回，而不是散落在主循环中直接 push。

选择原因：

- 兼容现有行为，降低回归风险
- 保持 observability 和 hooks 生命周期不需要同步重写

备选方案：

- 把 hooks 也重构成 section provider
  - 不采用原因：这会把 PRD-15 范围扩大到 hook 架构重设计

## Risks / Trade-offs

- [Risk] prompt builder 边界划分不当，导致 memory 或 notifications 顺序变化引发行为回归
  → Mitigation：补 builder 单测和回归 smoke，校验关键 sections 出现顺序与注入位置

- [Risk] 现有 hooks 追加 system messages 的时机与 builder 冲突
  → Mitigation：先保持 hooks 结果作为 supplemental messages 接入，不改 hook 生命周期

- [Risk] 将 `SYSTEM` 下沉后，调用方改动面会扩大到 `cli.ts` 和 `agent-loop.ts`
  → Mitigation：保留最小公共接口，例如 `buildPromptEnvelope(...)`，让主循环只改一处调用

- [Trade-off] 采用“两层输出”会比单字符串多一个结构层
  → Benefit：换来更清晰的运行时边界和更低的后续扩展成本

## Migration Plan

1. 新增 prompt 模块与 builder 单测
2. 将现有 `SYSTEM` 内容迁移为 core section
3. 将 `agent-loop.ts` 中现有 memory / notifications / reminder 注入收敛为 builder 输入
4. 保持模型请求结构不变：仍然发送 system messages + 历史消息，只是 system 来源由 builder 统一生成
5. 运行构建与相关 smoke / regression 验证

回滚策略：

- 若 builder 接入后出现行为回归，可回退到上一版 `config.ts + agent-loop.ts` 直接拼接方式，因为本次改动主要是内部重构

## Open Questions

- `skills` section 当前在 `apps/agent-cli` 中还没有与主循环显式集成，首版是否提供空实现/预留接口即可
- `CLAUDE.md` / 长期规则链在当前仓库里是否已有确定来源，还是先以 `AGENT.md` / 配置化规则源抽象占位
