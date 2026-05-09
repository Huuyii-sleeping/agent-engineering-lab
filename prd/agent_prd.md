# TypeScript Agent 全量 PRD（覆盖 01-19 教学目录）

## 0. 文档目标
本 PRD 用于指导你在 `typescript` 目录实现一个完整 Agent，要求覆盖当前教学目录 `s01` 到 `s19` 的核心能力与约束，不遗漏主循环、系统加固、任务运行时和多 Agent 平台中的关键机制。

---

## 1. 产品定义

### 1.1 产品名称
TypeScript Coding Agent（教学版全量融合）

### 1.2 核心定位
一个可在本地工作区执行开发任务的终端 Agent，支持：
- 基础工具调用循环
- 文件读写编辑
- 任务规划
- 子代理委派
- 技能按需加载
- 上下文压缩
- 持久化任务系统
- 后台任务
- 多代理团队协作
- 协议化审批与关停
- 自治代理
- Worktree 隔离并行开发

### 1.3 用户场景
- 在 CLI 中输入自然语言任务，由 Agent 通过工具执行。
- 多阶段复杂需求中，持续追踪任务、并行处理、分工协作、最终收敛交付。

---

## 2. 全局约束与运行规范

### 2.1 环境变量与初始化
- 启动时必须加载 `.env`（`dotenv.config({ override: true })`）。
- 必须读取 `MODEL_ID`；缺失即抛错并退出。
- 使用 OpenAI 客户端：
  - `apiKey = OPENAI_API_KEY`
  - `baseURL = OPENAI_BASE_URL`

### 2.2 会话与循环范式
- 所有章节遵循同一主循环：
  1. `chat.completions.create(...)`
  2. 取 `message`
  3. 追加 assistant 消息到 `history`
  4. 若无 `tool_calls`，结束本轮
  5. 逐个执行工具，回填 `role: tool` 结果
  6. 继续下一轮

### 2.3 通用请求参数
- `max_tokens = 8000`（摘要场景除外，如压缩摘要为 2000）
- 消息结构统一使用 `ChatCompletionMessageParam[]`

### 2.4 通用安全策略
- 屏蔽危险命令关键片段：
  - `rm -rf /`
  - `sudo`
  - `shutdown`
  - `reboot`
  - `> /dev/`（部分章节）
- 默认 shell 命令超时：120 秒
- 背景/工作树运行超时：300 秒
- 命令输出最多截断到 50,000 字符

### 2.5 路径安全策略
- 读取/写入/编辑文件前，必须校验路径不逃逸工作区：
  - `path.resolve(WORKDIR, p)`
  - `path.relative(WORKDIR, resolved)`
  - 若 `..` 或绝对越界则拒绝

---

## 3. 版本能力需求（S01-S12）

## 3.1 S01 Agent Loop（`01_agent_loop.ts`）

### 功能目标
- 建立最小可用 Agent 循环，仅支持 `bash` 工具。

### 必须实现
- `runBash(command)` 执行 shell，支持超时与危险命令拦截。
- `toAssistantMessage(message)` 转换 tool_calls。
- `agentLoop(messages)` 持续处理 tool_use。
- CLI 交互：
  - 提示符 `s01 >>`
  - `q/exit/空输入` 退出

### 工具
- `bash(command: string)`

---

## 3.2 S02 Tool Use（`02_tool_use.ts`）

### 功能目标
- 在不改变主循环的前提下扩展多工具分发。

### 必须实现
- 文件工具：
  - `read_file(path, limit?)`
  - `write_file(path, content)`
  - `edit_file(path, old_text, new_text)`
- `safePath` 防越界
- `TOOL_HANDLERS` 映射式分发

### 工具集合
- `bash`
- `read_file`
- `write_file`
- `edit_file`

---

## 3.3 S03 TodoWrite（`03_todo_write.ts`）

### 功能目标
- 模型自维护任务列表并可视化进度。

### 必须实现
- `TodoManager`：
  - 最多 20 条
  - 状态仅允许：`pending/in_progress/completed`
  - 同时最多 1 条 `in_progress`
  - `render()` 输出 `[ ] [>] [x]` 标记
- 新增工具 `todo(items)`
- 提醒机制：
  - 连续 3 轮未调用 `todo`，注入 `<reminder>Update your todos.</reminder>`

### 工具集合
- `bash/read_file/write_file/edit_file/todo`

---

## 3.4 S04 Subagent（`04_subagent.ts`）

### 功能目标
- 支持父代理通过 `task` 派发子代理，实现上下文隔离。

### 必须实现
- `runSubagent(prompt)`：
  - 子代理使用独立 `messages=[]`
  - 最多 30 轮安全上限
  - 子代理只允许基础工具（不允许递归 `task`）
  - 返回最终文本摘要给父代理
- 父代理新增 `task(prompt, description?)` 工具

### 工具集合
- 子代理：`bash/read_file/write_file/edit_file`
- 父代理：`bash/read_file/write_file/edit_file/task`

---

## 3.5 S05 Skill Loading（`05_skill_loading.ts`）

### 功能目标
- 技能两层注入：系统中仅放简介，细节按需加载。

### 必须实现
- `skills/` 扫描：
  - 递归查找 `SKILL.md`
- Frontmatter 解析：
  - 解析 `--- ... ---` 元数据（name/description/tags）
- `SkillLoader`：
  - `loadAll()`
  - `getDescriptions()`（系统层）
  - `getContent(name)`（工具层）
- `load_skill(name)` 工具返回 `<skill ...>...</skill>`

### 工具集合
- `bash/read_file/write_file/edit_file/load_skill`

---

## 3.6 S06 Context Compact（`06_context_compact.ts`）

### 功能目标
- 三层压缩，保证长会话可持续运行。

### 必须实现
- 常量：
  - `THRESHOLD = 50000`
  - `TRANSCRIPT_DIR = .transcripts`
  - `KEEP_RECENT = 3`
  - `PRESERVE_RESULT_TOOLS = {read_file}`
- `estimateTokens(messages)`：字符/4 估算
- `microCompact(messages)`：
  - 仅压缩旧 `tool` 结果
  - 保留最近 3 条
  - `read_file` 输出不压缩
- `autoCompact(messages)`：
  - 将全量消息写入 `.transcripts/transcript_<ts>.jsonl`
  - 调用模型做连续性摘要
  - 用单条压缩摘要替换历史
- `compact` 工具：
  - 手动触发压缩

### 工具集合
- `bash/read_file/write_file/edit_file/compact`

---

## 3.7 S07 Task System（`07_task_system.ts`）

### 功能目标
- 会话外任务持久化（抗上下文压缩）。

### 必须实现
- `TaskManager` 持久化目录：`.tasks/`
- 文件格式：`task_<id>.json`
- 字段：
  - `id/subject/description/status/blockedBy/owner`
- 方法：
  - `create/get/update/listAll`
  - `clearDependency(completedId)`：任务完成后自动移除他人阻塞
- 状态：`pending/in_progress/completed`

### 工具集合
- `task_create(subject, description?)`
- `task_update(task_id, status?, addBlockedBy?, removeBlockedBy?)`
- `task_list()`
- `task_get(task_id)`
- 以及基础文件工具

---

## 3.8 S08 Background Tasks（`08_background_tasks.ts`）

### 功能目标
- 非阻塞执行长任务，结果异步回流。

### 必须实现
- `BackgroundManager`
  - `tasks: Map<taskId, {status,result,command}>`
  - `notificationQueue`
  - `run(command)`：立即返回 taskId
  - `check(task_id?)`：单任务或全量
  - `drainNotifications()`
- 主循环前注入后台完成消息：
  - `<background-results>...</background-results>`

### 工具集合
- `background_run(command)`
- `check_background(task_id?)`
- 以及基础文件工具

---

## 3.9 S09 Agent Teams（`09_agent_teams.ts`）

### 功能目标
- 构建多代理团队，通过 JSONL 收件箱通信。

### 必须实现
- 常量：
  - `TEAM_DIR=.team`
  - `INBOX_DIR=.team/inbox`
  - `VALID_MSG_TYPES`：
    - `message`
    - `broadcast`
    - `shutdown_request`
    - `shutdown_response`
    - `plan_approval_response`
- `MessageBus`
  - `send/readInbox/broadcast`
- `TeammateManager`
  - 持久化 `config.json`（team_name/members）
  - `spawn(name, role, prompt)`
  - 队友独立 loop（50 轮上限）
  - 状态：`working/idle/shutdown`
- Leader 工具：
  - `spawn_teammate/list_teammates/send_message/read_inbox/broadcast`
- CLI 命令：
  - `/team`
  - `/inbox`

---

## 3.10 S10 Team Protocols（`10_team_protocols.ts`）

### 功能目标
- 在团队通信上叠加“关停协议+计划审批协议”。

### 必须实现
- 全局跟踪器：
  - `shutdownRequests: request_id -> {target,status}`
  - `planRequests: request_id -> {from,plan,status}`
- 新增流程：
  - `shutdown_request(teammate)`：发起关停申请
  - `shutdown_response(request_id)`：查询关停状态
  - `plan_approval(request_id, approve, feedback?)`：审批队友计划
- 队友侧工具新增：
  - `shutdown_response(request_id, approve, reason?)`
  - `plan_approval(plan)`

### 协议要求
- 请求响应必须通过 `request_id` 关联。
- 状态必须支持 `pending/approved/rejected`。

---

## 3.11 S11 Autonomous Agents（`11_autonomous_agents.ts`）

### 功能目标
- 队友具备“空闲轮询 + 自动认领任务”能力。

### 必须实现
- 常量：
  - `POLL_INTERVAL = 5000ms`
  - `IDLE_TIMEOUT = 60000ms`
- 自治函数：
  - `scanUnclaimedTasks()`
  - `claimTask(taskId, owner)`（串行锁保护）
  - `makeIdentityBlock(name, role, teamName)`（压缩后身份回灌）
- 队友工作流：
  - WORK 阶段（正常 tool loop）
  - IDLE 阶段（轮询 inbox + 扫描任务）
  - 触发条件：
    - 收到消息恢复
    - 自动认领任务恢复
    - 超时关停
- 新增工具：
  - `idle`
  - `claim_task`
- Leader CLI 额外命令：
  - `/tasks`

---

## 3.12 S12 Worktree Task Isolation（`12_worktree_task_isolation.ts`）

### 功能目标
- 用任务板做控制面，用 git worktree 做执行面，实现并行隔离开发。

### 必须实现
- 仓库根检测：
  - `git rev-parse --show-toplevel`
  - 非 git 仓库回退 `WORKDIR`
- `EventBus`
  - 日志文件：`.worktrees/events.jsonl`
  - `emit/listRecent(limit)`
- `TaskManager`（增强版）
  - 字段新增：`worktree/created_at/updated_at`
  - `bindWorktree/unbindWorktree`
- `WorktreeManager`
  - 索引：`.worktrees/index.json`
  - `create/listAll/status/run/remove/keep`
  - `gitAvailable` 检测
  - `validateName`：`[A-Za-z0-9._-]{1,40}`
  - `runGit` 封装
  - 生命周期事件：
    - `worktree.create.before/after/failed`
    - `worktree.remove.before/after/failed`
    - `worktree.keep`
    - `task.completed`
- 收尾策略：
  - `worktree_remove(name, force?, complete_task?)`
  - `worktree_keep(name)`

### 工具集合（16 个）
- `bash/read_file/write_file/edit_file`
- `task_create/task_list/task_get/task_update/task_bind_worktree`
- `worktree_create/worktree_list/worktree_status/worktree_run/worktree_remove/worktree_keep/worktree_events`

---

## 4. 全量工具接口矩阵（01-12）

### 4.1 基础工具
- `bash(command)`
- `read_file(path, limit?)`
- `write_file(path, content)`
- `edit_file(path, old_text, new_text)`

### 4.2 规划与压缩
- `todo(items[])`
- `compact(focus?)`
- `task(prompt, description?)`（子代理委派）

### 4.3 知识与任务
- `load_skill(name)`
- `task_create/task_update/task_list/task_get`
- `task_bind_worktree`

### 4.4 后台与团队
- `background_run/check_background`
- `spawn_teammate/list_teammates/send_message/read_inbox/broadcast`
- `shutdown_request/shutdown_response/plan_approval`
- `idle/claim_task`

### 4.5 Worktree
- `worktree_create/list/status/run/remove/keep/events`

---

## 5. 持久化数据规范

## 5.1 `.tasks/task_<id>.json`
- S07 基础字段：
  - `id, subject, description, status, blockedBy, owner`
- S12 增强字段：
  - `worktree, created_at, updated_at`

## 5.2 `.team/config.json`
- `team_name`
- `members[]`：
  - `name`
  - `role`
  - `status`

## 5.3 `.team/inbox/<name>.jsonl`
- 一行一消息 JSON
- 消息类型必须属于 `VALID_MSG_TYPES`

## 5.4 `.transcripts/transcript_<ts>.jsonl`
- 上下文压缩前完整快照

## 5.5 `.worktrees/index.json`
- `worktrees[]`：
  - `name,path,branch,task_id,status,created_at,removed_at,kept_at`

## 5.6 `.worktrees/events.jsonl`
- 生命周期事件日志，供观测与追踪

---

## 6. 状态机定义

## 6.1 Todo 状态
- `pending -> in_progress -> completed`
- 全局约束：同一时刻仅一个 `in_progress`

## 6.2 Task 状态
- `pending/in_progress/completed`
- `completed` 时自动清理他人 `blockedBy`

## 6.3 Teammate 状态
- `working -> idle -> working`
- 或 `working/idle -> shutdown`

## 6.4 请求状态
- 关停请求：`pending/approved/rejected`
- 计划审批：`pending/approved/rejected`

## 6.5 Worktree 状态
- `active -> removed`
- `active -> kept`

---

## 7. CLI 与可用命令规范

### 7.1 章节提示符
- `s01 >>` 到 `s12 >>`

### 7.2 通用退出
- `q` / `exit` / 空输入

### 7.3 团队快捷命令
- S09/S10/S11：
  - `/team`
  - `/inbox`
- S11：
  - `/tasks`

---

## 8. 验收标准（必须全部通过）

### AC-01
输入普通需求，Agent 能在无工具时直接结束，在有工具时循环执行至收敛。

### AC-02
`read/write/edit` 全部可用，且路径越界会被拒绝。

### AC-03
`todo` 能正确渲染任务列表并执行状态约束；遗漏更新会触发提醒注入。

### AC-04
`task` 委派子代理可运行，父上下文保持整洁，只回收摘要。

### AC-05
`load_skill` 能从 `skills/**/SKILL.md` 按名加载正文。

### AC-06
长会话触发自动压缩并落盘 transcript；手动 `compact` 同样生效。

### AC-07
任务板可持久化 CRUD，重启后仍可恢复。

### AC-08
后台任务可并行执行，结果会在后续轮次自动注入。

### AC-09
多队友可被创建并持续通信，`/team` `/inbox` 可观测。

### AC-10
关停与计划审批协议能通过 `request_id` 正确关联和追踪。

### AC-11
自治队友可在 idle 期自动认领任务并继续执行；空闲超时后退出。

### AC-12
Worktree 创建/运行/状态/保留/删除/事件日志全链路可用，且任务可与 worktree 绑定闭环。

---

## 9. 代码覆盖清单（与 01-12 一一对应）

## 9.1 `01_agent_loop.ts`
- 函数：`runBash/toAssistantMessage/agentLoop/main`
- 工具：`bash`

## 9.2 `02_tool_use.ts`
- 函数：`safePath/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file`

## 9.3 `03_todo_write.ts`
- 类型/类：`TodoStatus/TodoItem/TodoManager`
- 函数：`safePath/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file/todo`

## 9.4 `04_subagent.ts`
- 函数：`parseArgs/safePath/runBash/runRead/runWrite/runEdit/toAssistantMessage/runSubagent/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file/task`

## 9.5 `05_skill_loading.ts`
- 类：`SkillLoader`
- 函数：`parseArgs/safePath/runBash/runRead/runWrite/runEdit/findSkillFiles/parseFrontmatter/toAssistantMessage/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file/load_skill`

## 9.6 `06_context_compact.ts`
- 函数：`parseArgs/estimateTokens/safePath/microCompact/autoCompact/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 常量：`THRESHOLD/TRANSCRIPT_DIR/KEEP_RECENT/PRESERVE_RESULT_TOOLS`
- 工具：`bash/read_file/write_file/edit_file/compact`

## 9.7 `07_task_system.ts`
- 类：`TaskManager`
- 函数：`parseArgs/safePath/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file/task_create/task_update/task_list/task_get`

## 9.8 `08_background_tasks.ts`
- 类：`BackgroundManager`
- 函数：`parseArgs/safePath/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 工具：`bash/read_file/write_file/edit_file/background_run/check_background`

## 9.9 `09_agent_teams.ts`
- 类：`MessageBus/TeammateManager`
- 函数：`parseArgs/isMsgType/safePath/sleep/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 常量：`VALID_MSG_TYPES`
- 工具：`bash/read_file/write_file/edit_file/spawn_teammate/list_teammates/send_message/read_inbox/broadcast`

## 9.10 `10_team_protocols.ts`
- 类：`MessageBus/TeammateManager`
- 函数：`parseArgs/isMsgType/safePath/sleep/runBash/runRead/runWrite/runEdit/handleShutdownRequest/handlePlanReview/checkShutdownStatus/toAssistantMessage/agentLoop/main`
- 跟踪器：`shutdownRequests/planRequests`
- 工具：`bash/read_file/write_file/edit_file/spawn_teammate/list_teammates/send_message/read_inbox/broadcast/shutdown_request/shutdown_response/plan_approval`

## 9.11 `11_autonomous_agents.ts`
- 类：`MessageBus/TeammateManager`
- 函数：`parseArgs/isMsgType/safePath/sleep/scanUnclaimedTasks/claimTask/makeIdentityBlock/runBash/runRead/runWrite/runEdit/handleShutdownRequest/handlePlanReview/checkShutdownStatus/toAssistantMessage/agentLoop/printTasks/main`
- 常量：`POLL_INTERVAL/IDLE_TIMEOUT/VALID_MSG_TYPES`
- 工具：`bash/read_file/write_file/edit_file/spawn_teammate/list_teammates/send_message/read_inbox/broadcast/shutdown_request/shutdown_response/plan_approval/idle/claim_task`

## 9.12 `12_worktree_task_isolation.ts`
- 类：`EventBus/TaskManager/WorktreeManager`
- 函数：`detectRepoRoot/parseArgs/safePath/toJsonLine/runBash/runRead/runWrite/runEdit/toAssistantMessage/agentLoop/main`
- 常量：`REPO_ROOT`
- 工具：`bash/read_file/write_file/edit_file/task_create/task_list/task_get/task_update/task_bind_worktree/worktree_create/worktree_list/worktree_status/worktree_run/worktree_remove/worktree_keep/worktree_events`

---

## 10. 实施建议（你后续实现 Agent 时）

1. 先实现统一核心循环与基础 4 工具（对应 S01/S02）。
2. 再并入状态管理（Todo + Task Board + Compact）。
3. 然后并入并发层（Background + Team + Protocol）。
4. 最后加入自治与 Worktree 隔离（S11/S12）。
5. 每完成一层就跑一次阶段验收（按 AC-01~AC-12）。
