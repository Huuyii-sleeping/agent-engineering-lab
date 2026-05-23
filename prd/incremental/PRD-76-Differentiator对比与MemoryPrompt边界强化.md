# PRD-76 Differentiator 对比与 Memory Prompt 边界强化

## 背景

参考 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/05-differentiators-and-comparison.md`，Claude Code 的差异化优势集中在几个方向：统一执行内核、文件化 memory、权限主干、多 agent runtime 后端和长会话治理。

当前仓库已经具备：

- `AgentHost`、`QueryEngine`、`ToolService`、native / subagent / MCP 统一工具路由。
- JSONL 与 Markdown 混合 memory，包含 `.memory/*.jsonl`、durable `MEMORY.md`、agent memory prompt 绑定、team memory sync 和本地向量评分。
- 工具权限、approval replay、bash sandbox、read-only parallel safe 调度。
- subagent、team、task claim、background、scheduler、worktree 等异步协作原语。
- session journal、compact、session memory summary 和长会话恢复能力。

主要差距是：agent memory 入口被注入 stable prompt 时，`currentIndex` 没有硬上限。若 `MEMORY.md` 或 index 被写得过长，会直接撑大 system prompt，削弱长会话治理和 prompt cache 稳定性。文章中强调的 memory 入口边界，本仓库还缺少产品化约束。

## 目标

- 为 Agent Memory prompt 的 `currentIndex` 增加固定行数与字符上限。
- 截断时保留前部内容，并在 prompt 中显式说明被截断。
- 保持 `agentMemory.currentIndex` 字段兼容，不改变已有 agent memory 文件格式。
- 增加单元测试和 smoke，证明超长 memory index 不会原样进入 system prompt。

## 非目标

- 不重写 `QueryEngine` 为 AsyncGenerator stream。
- 不新增 tmux / iTerm / 外部 swarm backend。
- 不改变 memory 文件存储结构或检索评分算法。
- 不实现远端 memory sync 或云端团队 memory。

## 验收标准

- prompt builder 单元测试覆盖超长 `agentMemory.currentIndex` 的行数/字符截断。
- smoke 测试覆盖 PRD-76 核心路径：长 index 不完整进入 primary system prompt，并出现截断说明。
- OpenSpec validate 通过。
- `pnpm build` 通过。
