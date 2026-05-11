## 1. Artifacts

- [x] 1.1 proposal/design/specs 完成

## 2. Implementation

- [x] 2.1 新增统一模型策略模块，支持 `planning / coding / review / ops` 路由
- [x] 2.2 新增 session / daily token budget 守卫与持久化
- [x] 2.3 为主循环接入模型策略、预算检查与 fallback 选择
- [x] 2.4 为 subagent 接入同一模型策略入口
- [x] 2.5 扩展 observability，记录模型命中、预算状态、estimated cost 和 latency

## 3. Validation

- [x] 3.1 新增模型策略单测
- [x] 3.2 新增 PRD-11 smoke，验证路由、预算超限和 fallback
- [x] 3.3 运行 `pnpm --filter agent-cli test`、`pnpm --filter agent-cli build` 与对应 smoke
