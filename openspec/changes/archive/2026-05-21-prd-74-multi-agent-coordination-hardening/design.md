## Context

仓库里已经存在三类 multi-agent 协作原语：

- `subagent_*` 负责异步工作委派。
- `team_*` 负责 teammate、消息与协议请求。
- `task_*` 负责任务状态与工作流跟踪。

但它们之间仍是松散拼接，缺少协调者视角最需要的三个信号：谁在执行、谁收到了什么、谁拥有哪个任务。

## Goals / Non-Goals

**Goals:**

- 让 subagent、team inbox 和 task board 的协作关系显式化。
- 保持工具面兼容，尽量只扩展字段与新增工具。
- 让 coordinator 可以从输出中直接判断代理角色、未读消息和任务 owner。

**Non-Goals:**

- 不实现外部进程树管理。
- 不做复杂的跨 agent 调度算法。
- 不把 team inbox 改成数据库。

## Decisions

### 1. 扩展现有记录，而不是新增并行编排层

决策：在 `SubagentRecord`、`Teammate`/inbox state 和 `Task` 现有模型上做增量扩展。

备选方案：新增一个独立 coordinator service。  
不采用原因：当前缺口主要是数据和工具契约，不是控制平面缺失；先扩展现有边界更稳。

### 2. team inbox 采用显式 ack，而不是自动消费

决策：`team_read_inbox` 只读，新增 `team_mark_inbox_read` 负责提交 ack。

备选方案：读取时自动更新游标。  
不采用原因：自动消费会让调试和回放更难，也不利于模型在读取前比较上下文。

### 3. task claim 作为显式工具，owner 继续存于 task 实体

决策：新增 `task_claim` 工具，`task_list`/`task_get` 直接展示 owner。

备选方案：只靠 `task_update` 写 owner。  
不采用原因：显式 claim 更符合 multi-agent 分工，也更便于 coordinator 使用。

### 4. subagent 角色默认 worker，可显式声明 coordinator/reviewer

决策：`subagent_spawn` 支持 `role` 和可选 `parent_agent_id`。

备选方案：只加 name，不加角色。  
不采用原因：article 里的多 agent 模式强调层次与角色，缺少这层元数据会让协作输出仍然模糊。

## Risks / Trade-offs

- [Risk] 新增字段会触发较多测试快照变化。  
  Mitigation: 保持旧输出形状不变，只追加元数据。
- [Risk] inbox ack 语义可能和现有阅读习惯冲突。  
  Mitigation: 读取与 ack 分离，避免默认副作用。
- [Risk] task claim 可能与 autonomy 现有 claim 路径重叠。  
  Mitigation: 复用同一存储与校验逻辑，只新增显式入口。

