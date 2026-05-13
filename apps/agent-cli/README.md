# agent-cli

`apps/agent-cli` 是当前仓库里的主 Agent 运行时。这个 README 不是产品介绍，而是给 Web 开发协作使用的说明书。

它的目标是回答三类问题：

- 这个 Agent 现在已经支持什么能力
- 在开发一个功能时，应该优先怎么组织实现
- 如果要扩展 Agent，本仓库里应该沿着什么方式继续演进

这份文档需要随着 `agent-cli` 的开发持续更新。只要新增工具、改动运行机制、调整持久化格式或补充测试，都应该同步更新这里。

## 适用场景

- 在 CLI 中驱动 Agent 完成 Web 页面、接口、状态管理、调试和发布前检查
- 给 Web Console 或其他前端增加只读/可观测能力
- 把一个复杂需求拆成任务、子代理、后台任务或隔离工作目录并行推进
- 给 Agent 本身继续加新工具、新流程、新守卫、新恢复能力

## 快速启动

1. 安装依赖

```bash
pnpm install
```

2. 配置 `apps/agent-cli/.env`

```bash
MODEL_ID=your-model-id
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=your-base-url
```

3. 启动 CLI

```bash
pnpm --filter agent-cli dev
```

4. 构建与运行

```bash
pnpm --filter agent-cli build
pnpm --filter agent-cli start
```

5. 启动 Web Console

```bash
pnpm --filter agent-web-console dev
```

## 开发原则

- 先把需求落到任务，再开始实现。复杂工作不要直接靠长对话硬顶。
- 能通过现有工具表达，就不要额外发明新流程。
- 风险高、耗时长、并行性强的工作，优先使用 `task_*`、`worktree_*`、`subagent_*`、`background_*`。
- 对用户、业务、接口约束这类会复用的信息，及时写入 `memory_*`。
- 任何会影响可恢复性和可观测性的改动，都要考虑 `.observability`、`.security`、`.schedule`、`.tasks` 等持久化副作用。
- Agent 新增能力时，优先复用现有模式：`tool definition + handler + persistence + notification + tests`。

## 一个 Web 功能应该怎么做

推荐顺序如下：

1. 用 `task_create` 建立任务，必要时通过 `task_update` 补充依赖关系和 `worktree` 归属。
2. 用 `todo` 管理当前轮次要做的子步骤，避免长会话漂移。
3. 如果改动风险高或需要并行，先 `worktree_create` 再在隔离目录里 `worktree_run`。
4. 如果有长耗时命令，例如构建、截图、测试、爬日志，优先 `background_run`，然后用 `check_background` 轮询。
5. 如果需要分工，把明确边界的子任务交给 `subagent_spawn` + `subagent_send`。
6. 如果需求里有长期约束或已经确认的实现决策，用 `memory_add` 记录，后续检索靠 `memory_search`。
7. 如果需要将未来动作重新注入主循环，例如提醒验证、延迟检查，使用 `schedule_create`。
8. 最后至少运行对应测试；发布前跑 `pnpm --filter agent-cli release:check`。

## 当前能力总览

### 1. CLI 主循环

- 入口在 [src/main.ts](/Users/bytedance/Personal/agent-engineering-lab-web/apps/agent-cli/src/main.ts:1) 和 [src/cli.ts](/Users/bytedance/Personal/agent-engineering-lab-web/apps/agent-cli/src/cli.ts:1)
- 支持交互式对话
- 支持调度器后台轮询
- 调度到点后会主动把结果推回 CLI，而不是只在下次用户发问时处理

### 2. Prompt 构建与恢复

- 入口在 [src/agent-loop.ts](/Users/bytedance/Personal/agent-engineering-lab-web/apps/agent-cli/src/agent-loop.ts:1)
- 支持动态 system message 注入
- 支持自动记忆注入、后台通知注入、团队通知注入、定时通知注入
- 支持超长上下文恢复、自动压缩和错误分类恢复

### 3. 文件与命令执行

- `bash`
- `read_file`
- `write_file`
- `edit_file`

典型用途：

- 修改前端组件
- 读取日志和配置
- 跑本地构建、测试、lint

注意：

- 文件写入和编辑默认受安全策略控制
- `bash` 也会经过安全闸门

### 4. 任务与进度管理

- `todo`
- `task_create`
- `task_update`
- `task_list`
- `task_get`

典型用途：

- 把一个页面开发拆成 UI、接口、状态、测试几个阶段
- 为多个功能建立依赖关系
- 给工作目录绑定 `worktree`

持久化位置：

- `.runtime/todos.json`
- `.tasks/task_<id>.json`

### 5. 记忆系统

- `memory_add`
- `memory_search`
- `memory_list`

典型用途：

- 记录“这个页面必须兼容移动端”
- 记录“接口字段已经确认不能改名”
- 记录“某次实现已经决定使用某个模式”

运行时还会自动从用户输入中提取可复用信息，并在后续问题中自动注入相关记忆。

### 6. 上下文压缩

- `estimate_tokens`
- `compact`

典型用途：

- 长会话中主动查看上下文规模
- 在任务做很久时手动压缩
- 自动压缩前后会把快照写入 `.transcripts`

### 7. 定时调度

- `schedule_create`
- `schedule_list`
- `schedule_remove`

当前行为：

- 支持 6 段 cron：`秒 分 时 日 月 周`
- 兼容 5 段 cron，秒默认是 `0`
- 调度记录和触发通知都持久化
- 到点后会主动把 `scheduled_prompt` 推回主循环

示例：

```text
*/3 * * * * *  -> 每 3 秒
0 */5 * * * * -> 每 5 分钟
```

持久化位置：

- `.schedule/records.json`
- `.schedule/notifications.json`

### 8. 后台任务

- `background_run`
- `check_background`

典型用途：

- 跑 dev server
- 跑构建
- 跑较慢的测试
- 拉长日志观察窗口

完成后会自动生成通知并注入下一轮主循环。

### 9. 子代理

- `subagent_spawn`
- `subagent_send`
- `subagent_wait`
- `subagent_list`
- `subagent_close`

适合场景：

- 把样式调整和接口联调拆开
- 把“读代码总结”与“实际改代码”分离
- 让主代理保持上下文简洁

约束：

- 子代理使用基础工具集
- 子代理结果通过通知回流主循环

### 10. 团队通信

- `team_add_teammate`
- `team_set_status`
- `team_message`
- `team_broadcast`
- `team_shutdown_request`
- `team_shutdown_response`
- `team_plan_approval_request`
- `team_plan_approval_response`
- `team_list_teammates`
- `team_read_inbox`
- `team_list_requests`

适合场景：

- 模拟多人并行协作
- 给不同“角色”分发任务
- 做计划审批和关停流程演练

持久化位置：

- `.team/teammates.json`
- `.team/requests.json`
- `.team/inbox/*.jsonl`

### 11. 安全审批

- `security_check`
- `security_request_approval`
- `security_approve`
- `security_reject`
- `security_list_approvals`
- `security_reload_policy`

当前机制：

- 高风险 `bash`、文件写入、后台命令等操作可被策略阻断
- 可通过审批请求放行一次具体操作
- 所有决策和审批都有审计记录

持久化位置：

- `.security/policy.json`
- `.security/approvals.json`
- `.audit/security_events.jsonl`

### 12. 工作目录隔离

- `worktree_create`
- `worktree_list`
- `worktree_run`
- `worktree_keep`
- `worktree_remove`

适合场景：

- 多个页面并行开发
- 风险改造与主工作区隔离
- 需要单独安装、单独构建、单独验证的尝试性工作

持久化位置：

- `.worktrees/index.json`
- `.worktrees/events.jsonl`

### 13. 自主任务轮询

- `autonomy_set_owner`
- `autonomy_status`
- `autonomy_tick`
- `autonomy_mark_active`

作用：

- 让运行时在空闲时自动扫描未认领任务
- 自动 claim 可执行任务
- 在超时后进入 shutdown

### 14. 可观测性与回放

- 运行时会记录模型请求、工具调用、通知事件、恢复决策
- 支持 trace 回放

命令：

```bash
pnpm --filter agent-cli replay:trace
```

持久化位置：

- `.observability/metrics.json`
- `.observability/events.jsonl`

### 15. Hooks

- 配置入口在 `.codex/hooks.json`
- 当前事件点：
  - `SessionStart`
  - `UserPromptSubmit`
  - `PreToolUse`
  - `PostToolUse`
  - `Stop`

适合场景：

- prompt 提交前做校验
- 工具执行前做额外约束
- 统一插入团队规范、页面规范、提测规范

## Web 开发常用组合

### 新增一个页面或功能模块

1. `task_create`
2. `todo`
3. `read_file` / `edit_file` / `write_file`
4. `background_run` 跑 dev 或 build
5. `check_background`
6. `memory_add` 记录最终约束

### 做高风险重构

1. `task_create`
2. `worktree_create`
3. `worktree_run`
4. `subagent_spawn` 分拆阅读或验证
5. `worktree_keep` 或 `worktree_remove`

### 做长期调试或延迟验证

1. `background_run`
2. `schedule_create`
3. 等待主动调度回流
4. 根据结果继续处理

### 有安全风险的操作

1. `security_check`
2. `security_request_approval`
3. `security_approve`
4. 再执行实际工具

## 实战示例

### 示例 1：新增一个活动落地页

目标：

- 新建页面结构
- 补基础样式
- 跑构建确认无报错

推荐做法：

1. `task_create`
   `subject="实现活动落地页"`, `description="包含 hero、卖点区、FAQ、移动端适配"`
2. `todo`
   把工作拆成 `页面骨架`、`样式实现`、`响应式检查`、`构建验证`
3. `read_file`
   先看现有路由、布局组件、样式组织方式
4. `edit_file` / `write_file`
   实际改页面和样式文件
5. `background_run`
   跑 `pnpm --filter agent-web-console build` 或对应前端构建命令
6. `check_background`
   查看构建是否完成
7. `memory_add`
   记录“这个落地页使用了现有营销页布局约束”这类后续会复用的决策

### 示例 2：联调一个新接口

目标：

- 页面接入后端返回的新字段
- 避免字段命名在实现过程中反复漂移

推荐做法：

1. `task_create`
   把“接口接入”和“页面展示”作为同一个任务，必要时再拆子任务
2. `read_file`
   查看 API 层、类型定义、调用位置
3. `memory_add`
   先记下已确认的字段约束，例如“`published_at` 使用毫秒时间戳”
4. `edit_file`
   改类型、请求映射、页面消费逻辑
5. `security_check`
   如果要跑高风险命令，先确认是否会触发审批
6. `background_run`
   跑测试或本地构建
7. `task_update`
   验证完成后把任务更新为 `completed`

### 示例 3：并行处理 UI 和逻辑重构

目标：

- 一边调整页面视觉
- 一边清理状态管理或数据流

推荐做法：

1. `task_create`
   创建主任务
2. `worktree_create`
   为高风险改造开隔离目录
3. `subagent_spawn`
   创建一个专门做阅读或辅助修改的子代理
4. `subagent_send`
   让子代理先总结目标模块结构或处理边界清晰的小块工作
5. 主代理继续在当前工作区或 `worktree_run` 里推进主线实现
6. `subagent_wait`
   等子代理完成
7. `worktree_keep` 或 `worktree_remove`
   根据结果决定保留还是清理隔离目录

### 示例 4：做延迟验证或定时回看

目标：

- 某个 dev server 或后台任务启动后，过几秒再让 Agent 自动回来检查

推荐做法：

1. `background_run`
   先启动目标进程
2. `schedule_create`
   例如 `*/10 * * * * *`，10 秒后提醒“检查 dev server 日志”
3. 不需要再次手动提问
4. 到点后 CLI 会主动收到 `scheduled_prompt`
5. Agent 在下一轮里结合后台任务状态继续处理

### 示例 5：给团队加统一开发约束

目标：

- 每次 prompt 提交前都注入前端规范
- 每次工具执行前都做额外检查

推荐做法：

1. 配置 `.codex/hooks.json`
2. 在 `UserPromptSubmit` 中补充约束，例如“优先复用现有 design system”
3. 在 `PreToolUse` 中拦截某些不允许的命令或路径
4. 配合 `security_*` 工具，形成“静态策略 + 动态 hook”双层守卫

## 当前运行时目录

- `.tasks`：任务板
- `.runtime`：todo 快照等运行时状态
- `.memory`：短期/长期记忆
- `.observability`：trace 与 metrics
- `.security`：策略与审批
- `.audit`：安全审计日志
- `.team`：团队、协议、收件箱
- `.worktrees`：隔离工作目录与事件
- `.schedule`：调度记录与通知
- `.transcripts`：上下文压缩前后快照

## 测试与发布检查

常用命令：

```bash
pnpm --filter agent-cli test
pnpm --filter agent-cli build
pnpm --filter agent-cli test:regression
pnpm --filter agent-cli test:security
pnpm --filter agent-cli test:memory
pnpm --filter agent-cli test:observability
pnpm --filter agent-cli test:hooks
pnpm --filter agent-cli test:recovery
pnpm --filter agent-cli test:scheduler
pnpm --filter agent-cli test:mcp
pnpm --filter agent-cli release:check
```

要求：

### MCP 外部能力

项目级 MCP server 可通过 `.codex/mcp.json` 接入。最小示例：

```json
{
  "schemaVersion": 1,
  "servers": [
    {
      "name": "demo",
      "command": "node",
      "args": ["./relative/path/to/server.mjs"]
    }
  ]
}
```

接入后，工具会以 `mcp__<server>__<tool>` 形式暴露，并统一经过安全审批、观测和工具回填链路。

- 新增工具至少补单测或 smoke test
- 改动持久化结构时要考虑旧数据兼容
- 改动通知链路时要验证 CLI 输出和主循环注入都正常

## 如果你要继续扩展 agent-cli

新增一个能力时，优先按这个顺序做：

1. 在 `src/tools/*.ts` 中定义工具和 handler
2. 在 `src/tools/base.ts` 或 `src/tools/index.ts` 注册
3. 如果有状态，明确持久化目录和 schema
4. 如果结果要异步回流，提供 notification drain 机制
5. 在 `agent-loop.ts` 里决定是否注入 system message
6. 补测试
7. 更新本 README

## README 维护约定

以下变化发生时，必须更新这份 README：

- 新增或删除工具
- 工具参数变化
- 持久化目录变化
- 主循环注入逻辑变化
- 新增 Web 开发推荐流程
- 测试命令变化

最低更新范围：

- “当前能力总览”
- “Web 开发常用组合”
- “当前运行时目录”
- “测试与发布检查”
