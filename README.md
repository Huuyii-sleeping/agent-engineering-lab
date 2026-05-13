# Agent Workspace

这个仓库用于构建和迭代一个可在本地工作区运行的 Coding Agent，采用 PRD 增量开发加 OpenSpec 规范化变更流程。

## 仓库结构

- `apps/agent-cli/`：核心 Agent CLI 与运行时（TypeScript）
- `apps/web-console/`：Web 展示端（React + TypeScript + Vite）
- `prd/incremental/`：按阶段拆分的 PRD（`PRD-00` 到后续）
- `openspec/`：OpenSpec 变更、规格与归档记录
- `docs/learning/claude-code/operations/`：按统一操作类型沉淀的架构讲解文档
- `AGENT.md`：当前工作区执行规范

## 环境要求

- Node.js 22+
- `pnpm`

## 快速启动

核心项目目录：`apps/agent-cli`

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量（可放到 `.env`）

```bash
MODEL_ID=你的模型 ID
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=可选，兼容网关时填写
```

3. 启动 Agent 开发模式

```bash
pnpm dev:agent
```

4. 构建与运行

```bash
pnpm build:agent
pnpm start:agent
```

## Web 端

```bash
pnpm dev:web
pnpm build:web
```

## 发布前检查

在仓库根目录执行统一发布检查：

```bash
pnpm release:check
```

该命令会进入 `agent-cli` 并串行执行 lint、unit test、build，以及当前已交付能力的 smoke / regression 验证。

## 架构学习文档

架构沉淀只维护 `operations/` 主线，不再维护按 PRD 编号排列的学习流水账。推荐从这里开始：

```text
docs/learning/claude-code/README.md
docs/learning/claude-code/operations/
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

1. 先看对应 PRD（`prd/incremental/`）。
2. 按 OpenSpec 产出 proposal、design、spec、tasks。
3. 实现并做 smoke/回归测试。
4. 提交前按规则清理 `.tasks/.team/.worktrees/.transcripts/tmp` 等运行产物。
5. 验证通过后归档变更并提交。
6. 如果本轮改变了工程方法，更新 `docs/learning/claude-code/operations/` 中对应文档。
