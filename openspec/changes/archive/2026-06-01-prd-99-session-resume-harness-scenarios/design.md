## Context

当前仓库已经完成本地生产级 release gate、harness matrix、deterministic model 和 QueryEngine harness。session persistence 也已有 append-only journal 与 snapshot fallback 的基础能力，但现有 smoke 更偏存储层，不能证明服务重启后还能通过 AgentService / QueryEngine 继续完成真实 chat。

本次变更聚焦本地生产级 v1 的关键链路：恢复后的 session 必须能继续进入真实 agent loop，而不是只被 `SessionStore.load()` 读取出来。

## Goals / Non-Goals

**Goals:**

- 覆盖 AgentService 级别的 session restart/resume/continue-chat 链路。
- 使用 deterministic model，保证测试无网络、可重复、可进入 release gate。
- 断言 session 连续性、history 追加、runtime state 连续、journal append-only 和 session 隔离。
- 将场景纳入 harness matrix，让后续生产级验证不会漏掉 resume 链路。

**Non-Goals:**

- 不实现远端 session 生成或分布式恢复能力。
- 不改变用户可见 API，除非现有服务层缺少测试所需的本地恢复注入入口。
- 不引入新数据库、队列或外部依赖。
- 不做 UI/TUI 展示和性能 benchmark。

## Decisions

1. 使用服务层/QueryEngine 链路测试，而不是只扩展 SessionStore smoke。

   - 选择原因：生产风险发生在恢复后继续运行 agent round 的组合链路，单独验证存储层不足以证明恢复可用。
   - 备选方案：只增加 `SessionStore` 单测。未采用原因：无法发现 service cache、busy guard、runtime state 注入和 QueryEngine finalization 的集成问题。

2. 将场景注册到 harness matrix，而不是只放独立 smoke。

   - 选择原因：PRD-98 已把 release gate 作为本地生产级入口，matrix 能被 `test:harness` 和 release gate 稳定覆盖。
   - 备选方案：新增单独脚本。未采用原因：入口分散，后续容易漏跑。

3. 测试使用临时 workspace 与 deterministic model。

   - 选择原因：保证无网络、可重复、不会污染本地 `.sessions`、`.memory` 等运行产物。
   - 备选方案：使用真实模型或固定本机目录。未采用原因：不可重复且有外部系统风险。

4. 保持实现增量化，只补齐必要恢复入口。

   - 选择原因：当前目标是生产级关键路径闭环，不做低价值重构。
   - 备选方案：重构整个 service/session 生命周期。未采用原因：范围过大，风险高，不符合本次收口目标。

## Risks / Trade-offs

- [Risk] 现有 AgentService 构造依赖较重，直接端到端测试可能需要较多 fixture。→ Mitigation：优先复用现有 harness fake runtime services 和 deterministic client，只在缺口处补薄适配。
- [Risk] matrix 场景过慢会拖累 release gate。→ Mitigation：场景只跑两轮 deterministic chat 和少量文件断言，不做真实网络或长等待。
- [Risk] 为测试暴露过宽的生产 API。→ Mitigation：只增加明确的本地恢复/注入入口，优先使用已有公开函数。
