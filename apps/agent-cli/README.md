# agent-cli

`apps/agent-cli` 是仓库当前的主 Agent 运行时与控制面，不是产品宣传页，而是给协作开发用的说明。

## 相关文档

- [仓库通用架构术语说明](../../docs/architecture-glossary.md)

## 它解决什么

- 当前 Agent 已支持哪些能力
- 新增功能时应优先沿用哪些现有模式
- 如果要继续扩展 Agent，应该沿着什么方向演进

## 使用场景

- 在 CLI 中驱动 Agent 完成页面、接口、状态管理、调试和发布前检查
- 给 Web Console 或其他前端增加只读或可观测能力
- 把复杂需求拆成任务、子代理、后台任务或隔离工作目录并行推进
- 继续给 Agent 增加工具、流程、守卫和恢复能力

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

4. 构建并运行

```bash
pnpm --filter agent-cli build
pnpm --filter agent-cli start
```

5. 启动 Web Console

```bash
pnpm --filter agent-web-console dev
```

## 开发原则

- 先把需求落到任务，再开始实现
- 能复用现有工具就不要额外发明流程
- 风险高、耗时长、并行性强的工作优先考虑 `task_*`、`worktree_*`、`subagent_*`、`background_*`
- 对可重复的信息，优先写入 `memory_*`
- 所有会影响可恢复性和可观测性的改动，都要考虑 `.observability`、`.security`、`.schedule`、`.tasks`
- 新增能力时，优先沿用现有模式：`tool definition + handler + persistence + notification + tests`

## 当前能力总览

- CLI 主循环：`src/main.ts`、`src/cli/index.ts`
- Prompt 构建与恢复：`src/agent-loop.ts`
- 文件与命令工具：`bash`、`read_file`、`write_file`、`edit_file`
- 任务与进度：`todo`、`task_create`、`task_update`、`task_list`、`task_get`
- 记忆：`memory_add`、`memory_search`、`memory_list`
- 上下文压缩：`estimate_tokens`、`compact`
- 定时调度：`schedule_create`、`schedule_list`、`schedule_remove`
- 后台任务：`background_run`、`check_background`
- 子代理：`subagent_spawn`、`subagent_send`、`subagent_wait`、`subagent_list`、`subagent_close`
- 团队通信：`team_*`
- 安全审批：`security_*`
- 工作目录隔离：`worktree_*`
- 观测与回放：`.observability`、`replay:trace`
- Hooks：`.codex/hooks.json`
- MCP：`src/entrypoints/mcp-server.ts`、`src/tools/mcp-*.ts`

## 继续扩展时的顺序

1. 在 `src/tools/*.ts` 中定义工具和 handler
2. 在 `src/tools/base.ts` 或 `src/tools/index.ts` 注册
3. 如果有状态，明确持久化目录和 schema
4. 如果结果需要异步回流，提供 notification 机制
5. 在 `agent-loop.ts` 中决定是否注入 system message
6. 补测试
7. 更新本文档

## 阅读约定

- 这个 README 只负责仓库内 agent-cli 的协作说明
- 架构术语、名词边界和概念定义，请优先看 [仓库通用架构术语说明](../../docs/architecture-glossary.md)
