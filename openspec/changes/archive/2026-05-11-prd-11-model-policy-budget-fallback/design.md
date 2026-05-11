## Context

当前仓库里与模型请求相关的入口主要有两处：
- `agent-loop.ts`：主代理请求
- `tools/subagent.ts`：子代理请求

它们都直接依赖 `MODEL` 常量，没有统一策略层。PRD-11 的目标不是实现复杂多厂商编排，而是在现有 OpenAI 调用链前面补一个轻量但统一的 policy/budget 层。

## Goals / Non-Goals

**Goals:**

- 让主循环和 subagent 都通过统一模型策略模块选模型
- 支持按 `planning / coding / review / ops` 选择不同模型
- 支持 session / daily token budget 守卫
- 支持主模型故障时自动 fallback 到备选模型
- 记录模型选择、延迟、成本估算和预算状态

**Non-Goals:**

- 不做跨供应商竞价
- 不做复杂缓存系统
- 不做精确账单级成本核算

## Decisions

### 决策 1：新增独立 `model-policy.ts`，统一主循环与 subagent 的模型决策

该模块负责：
- role 到模型策略的映射
- 预算读写
- fallback 选择
- 成本估算

这样主循环和子代理不再各自硬编码 `MODEL`。

### 决策 2：先实现四类角色路由，基于环境变量配置模型

角色收敛为：
- `coding`
- `planning`
- `review`
- `ops`

每类角色允许独立配置主模型和备选模型；若未配置，则退回默认模型。

### 决策 3：预算以 token 粗估为准，而不是依赖供应商精确计费

本期预算管理按以下数据运行：
- prompt token estimate
- completion tokens（来自 response usage）

使用粗粒度价格表估算成本，优先满足“可治理”，不追求账单级精度。

### 决策 4：fallback 只在模型请求级失败时触发一次切换

触发场景：
- rate limit
- timeout
- unavailable
- connection / 5xx

若主模型失败且该角色存在 fallback 模型，则切换一次；预算或策略不允许时则明确失败。

### 决策 5：预算超限时优先降级，再不满足则拒绝

顺序为：
1. 若当前角色有更低成本 fallback，先尝试降级
2. 若降级后仍不满足预算，直接拒绝并返回明确原因

这样能满足 AC-11-2，同时不把预算守卫做成纯 hard fail。

## Risks / Trade-offs

- [Risk] 成本估算不精确
  Mitigation：文档和事件里明确标注为 estimated cost

- [Risk] fallback 可能改变回答质量
  Mitigation：只做一次 fallback，并把最终命中的模型写入 observability

- [Risk] 预算状态需要持久化，可能引入额外运行产物
  Mitigation：独立放到 `.runtime/model_budget.json`，结构保持最小

## Migration Plan

1. 新增 `model-policy.ts` 与类型、预算存储
2. 扩展 runtime config / config，支持角色模型与 fallback 配置
3. 接入 `agent-loop.ts` 与 `tools/subagent.ts`
4. 扩展 observability 记录模型选择和 estimated cost
5. 新增单测与 PRD-11 smoke
