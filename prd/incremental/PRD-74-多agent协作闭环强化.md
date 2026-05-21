# PRD-74 多 agent 协作闭环强化

## 背景

参考 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/04h-multi-agent.md`，当前项目已经有 `subagent_*`、`team_*` 和 `task_*` 三组协作原语，但它们仍是分散的：子代理缺少显式角色元数据，team inbox 只有全量读取没有 ack 语义，task board 也没有显式 claim 工具和 owner 可见性。

这会让 multi-agent 协作停留在“能发消息”和“能派生子代理”的层面，缺少真正的协调闭环。

## 目标

- 为子代理补充角色与父子关系元数据，方便 coordinator/worker/reviewer 的层次化协作。
- 为 team inbox 增加 unread/ack 语义，避免消息重复重放。
- 为 task board 增加显式 claim 工具与 owner 可见性，让协调者可以分配和追踪任务。
- 保持当前工具契约兼容，优先做最小可落地改造。

## 非目标

- 不引入外部进程编排器或独立 swarm runtime。
- 不重写主循环调度模型。
- 不做跨仓库分布式协作。

## 验收标准

- 单元测试覆盖 subagent 角色元数据、team inbox ack、task claim/owner 展示。
- smoke 测试覆盖 multi-agent 协作的核心路径。
- `pnpm build` 通过。
- `openspec status --change "prd-74-multi-agent-coordination-hardening" --json` 显示完成。
- `openspec validate "prd-74-multi-agent-coordination-hardening" --type change` 通过。

