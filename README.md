# Agent Workspace（中文说明）

这个仓库用于构建和迭代一个可在本地工作区运行的 Coding Agent，采用 PRD 增量开发 + OpenSpec 规范化变更流程。

## 仓库主要内容
- `apps/agent-cli/`：核心 Agent CLI 与运行时（TypeScript）。
- `apps/web-console/`：Web 展示端（React + TypeScript + Vite）。
- `agent_dev/prd/incremental/`：按阶段拆分的 PRD（`PRD-00` 到后续）。
- `openspec/`：OpenSpec 变更、规格与归档记录。
- `WORKSPACE_AGENT_RULES.md`：当前工作区执行规范（提交前清理、流程约束等）。

## 环境要求
- Node.js 22+
- npm 或 pnpm

## 快速启动（核心项目）
核心项目目录：`apps/agent-cli`

1. 安装依赖
```bash
pnpm install
```

2. 配置环境变量（可放到 `.env`）
```bash
MODEL_ID=你的模型ID
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=可选，兼容网关时填写
```

3. 开发模式启动
```bash
pnpm dev:agent
```

4. 构建与运行
```bash
pnpm build:agent
pnpm start:agent
```

## Web 展示端

```bash
pnpm dev:web
pnpm build:web
```

## OpenSpec 常用命令
在仓库根目录执行：

```bash
openspec list --json
openspec status --change "<change-name>" --json
openspec validate "<change-name>" --type change --json
openspec archive "<change-name>" -y
```

## 推荐工作方式
1. 先看对应 PRD（`agent_dev/prd/incremental/`）。
2. 按 OpenSpec 产出 proposal/design/spec/tasks。
3. 实现并做 smoke/回归测试。
4. 提交前按规则清理 `.tasks/.team/.worktrees/.transcripts/tmp`。
5. 验证通过后归档变更并提交。
