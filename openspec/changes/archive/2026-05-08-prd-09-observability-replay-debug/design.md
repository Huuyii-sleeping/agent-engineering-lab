## Context

当前项目的执行日志主要依赖控制台输出，适合人工观察，但不适合作为稳定的审计与回放输入。与此同时，仓库已经存在若干可复用模式：

- `.audit/security_events.jsonl`：说明 JSONL 事件落盘模式已被接受。
- `.worktrees/events.jsonl`：说明事件日志适合做 append-only 记录。
- `runtime-config.ts`：说明运行时阈值与开关应集中配置。
- `background-task.ts` 与 `subagent.ts`：说明异步任务已有通知机制，可补充接入统一观测层。

PRD-09 是一个跨主循环、工具执行和异步运行时的横切改动，适合先落一个轻量 observability runtime，而不是将记录逻辑散落到每个模块。

## Goals / Non-Goals

**Goals:**

- 为每轮主循环建立稳定的 `trace_id`
- 为每次工具执行建立可追踪的 `span_id`
- 将关键运行事件落盘到 `.observability/events.jsonl`
- 产出基础指标快照 `.observability/metrics.json`
- 提供最小可用 replay runner，支持按 `trace_id` 回放
- 回放模式下默认阻断高危副作用，避免误执行

**Non-Goals:**

- 不引入外部 tracing / metrics 依赖
- 不保证模型文本逐字一致回放
- 不实现完整 UI 或可视化分析台

## Decisions

### 1. 新增独立 `observability` 模块，而不是把日志拼在现有工具里

- 方案 A：在每个工具内部自行写日志
- 方案 B：新增统一 `observability/runtime.ts`，由主循环和工具调度入口调用

选择 B。

原因：

- 主循环、工具调用、后台通知、子代理通知都需要统一字段，分散实现会导致事件格式漂移。
- 指标聚合天然需要集中入口，适合由统一 runtime 维护。

不采用 A 的原因：

- 容易重复实现时间、trace/span、序列化和指标累加逻辑。

### 2. 使用 append-only JSONL 事件日志 + 覆盖式 metrics 快照

- 方案 A：所有观测数据都写 JSONL
- 方案 B：事件写 JSONL，聚合指标写 JSON 快照

选择 B。

原因：

- 事件需要保序和可回放，适合 JSONL。
- 指标是聚合结果，读取场景以“当前快照”为主，适合 JSON。

不采用 A 的原因：

- 指标若也写事件流，读取端需要每次全量重算，不利于快速检查。

### 3. replay 以“工具事件驱动重放”为主，不重放整轮模型响应

- 方案 A：录制并重放完整模型原始响应
- 方案 B：读取指定 `trace_id` 的工具事件，按顺序重跑工具调用

选择 B。

原因：

- 当前系统未稳定保存模型原始请求/响应负载，直接做全量模型回放成本高。
- PRD-09 验收要求允许模型内容差异，更适合验证工具链路和副作用行为是否可重复。

不采用 A 的原因：

- 会显著扩大存储量与敏感信息暴露面，也会把 schema 绑定到 OpenAI SDK 响应细节。

### 4. 回放默认 dry-run，通过集中副作用守卫阻断高危操作

- 方案 A：回放完全执行真实工具
- 方案 B：回放默认 dry-run，对 `bash/write_file/edit_file/background_run/worktree_run` 等副作用工具返回阻断结果

选择 B。

原因：

- 回放主要用于定位问题，不应默认修改工作区或执行命令。
- 现有 `PRD-07` 已有安全网关，PRD-09 只补一层 replay 模式守卫，不重复实现权限系统。

不采用 A 的原因：

- 风险过高，容易在调试阶段污染本地状态。

## Runtime Flow

### 抽象模型

- `trace_id`：表示主代理一次完整的模型请求轮次
- `span_id`：表示该轮次内某一次具体动作，当前主要用于工具调用
- `events.jsonl`：事件流水账，记录“发生了什么”
- `metrics.json`：指标快照，记录“累计情况如何”

### 主链路时序图

```text
用户输入
  ↓
agent loop 开始
  ↓
生成 trace_id
  ↓
写入 loop_start 事件
  ↓
准备模型请求
  ↓
写入 model_request 事件
  ↓
模型返回
  ↓
写入 model_response 事件
  ↓
如果模型触发工具调用：
  对每个工具：
    生成 span_id
    写入 tool_call 事件
    执行工具
    写入 tool_result 事件
  ↓
如果有后台任务 / 子代理 / 团队通知：
  写入 notification / background_task 事件
  ↓
同步更新 metrics.json
```

### replay 时序图

```text
输入 trace_id
  ↓
读取 events.jsonl
  ↓
筛出该 trace_id 下的 tool_call 事件
  ↓
按原顺序重放工具调用
  ↓
默认开启 dry-run
  ↓
只读工具放行
副作用工具返回 REPLAY_DRY_RUN_BLOCKED
  ↓
写入 replay_start / replay_tool_result / replay_complete 事件
```

### 具体例子

假设用户说：“先读 README，再写一个 tmp 文件。”

系统内部会抽象成下面这组事件：

1. 主循环开始，生成 `trace_id=trace_xxx`
2. 写入 `loop_start`
3. 写入 `model_request`
4. 模型返回两个工具调用：`read_file`、`write_file`
5. 对 `read_file`：
   - 生成 `span_id=span_a`
   - 写入 `tool_call`
   - 执行读取
   - 写入 `tool_result(ok=true)`
6. 对 `write_file`：
   - 生成 `span_id=span_b`
   - 写入 `tool_call`
   - 执行写入
   - 写入 `tool_result(ok=true 或被安全策略拦截)`
7. `metrics.json` 中同步累计：
   - `toolCalls += 2`
   - 若失败则 `toolFailures += 1`
   - 更新每个工具的耗时聚合

如果后续对这个 `trace_id` 做 replay：

1. replay 读取到上述两个 `tool_call`
2. `read_file` 会被正常重放
3. `write_file` 在默认 dry-run 下会被阻断
4. replay 返回“顺序正确，但副作用已安全跳过”的结果

## Risks / Trade-offs

- [事件量增长] → 通过只记录关键事件、限制字段长度，避免 JSONL 快速膨胀
- [工具输出包含敏感信息] → 首期沿用现有工具返回内容；后续如有需要再做字段脱敏
- [replay 结果与线上不完全一致] → 明确 replay 目标是复现工具轨迹与副作用顺序，不保证模型文本一致
- [横切改动引入回归] → 通过 smoke 脚本覆盖 trace、日志、metrics、replay 四条核心链路

## Migration Plan

1. 新增 `.observability/` 目录与 runtime 初始化逻辑
2. 在主循环和工具调度入口接入事件记录
3. 为后台任务和子代理通知补充观测事件
4. 加入 replay runner 与 dry-run 守卫
5. 通过 smoke 与回归测试后启用

回滚策略：

- 如观测层引发问题，可整体移除 `observability` 模块接线，保留原有 stdout 行为

## Open Questions

- 首期是否需要持久化模型请求/响应全文
  - 当前决定：不做，只记录 token 估算和工具链路事件
- 是否需要给 replay 暴露成正式 tool
  - 当前决定：先作为内部模块和 smoke 能力实现，后续再决定是否对模型开放
