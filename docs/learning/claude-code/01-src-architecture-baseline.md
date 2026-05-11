# Claude Code 源码学习沉淀 01：`src/` 分层基线

## 目的

把外部 Claude Code 参考源码与当前仓库实现之间的映射关系沉淀下来，作为后续生产级重构的长期参考，而不是只停留在一次性对话里。

## 参考材料

- 架构解析：
  - `https://github.com/liuup/claude-code-analysis/blob/main/analysis/01-architecture-overview.md`
- 参考源码目录：
  - `https://github.com/liuup/claude-code-analysis/tree/main/src`
- 关键文件：
  - `src/main.tsx`
  - `src/QueryEngine.ts`
  - `src/query.ts`
  - `src/Tool.ts`
- 本仓库本地基线：
  - `typescript/01_agent_loop.ts` ~ `typescript/12_worktree_task_isolation.ts`
  - `apps/agent-cli/src/`

## 提炼出的架构信号

### 1. 入口很多，但核心职责不是“在入口里写业务”

从 `src/main.tsx` 的模块组织可以看出，虽然入口很大、很复杂，但它主要负责：

- 启动前置 side effects 与环境准备
- 命令行参数和交互模式分发
- 初始化系统上下文、用户上下文、服务与工具清单
- 把控制权交给后续 query / repl / command runtime

对我们来说，启发不是“把入口写得更大”，而是：

- 入口层可以复杂，但职责必须清晰；
- 入口是装配与调度中心，不应继续吞并核心运行时逻辑。

### 2. 目录分层明显，不是单纯按功能堆文件

参考 `src/` 目录可以看到明显的分层信号：

- `entrypoints`
- `bootstrap`
- `query`
- `tools`
- `services`
- `state`
- `tasks`
- `hooks`
- `skills`
- `server`
- `components / screens / ink`

这说明“真实工具”不是只把功能做出来，而是要给功能安排稳定的归属层。

### 3. QueryEngine 是可复用核心，而不是 UI 附件

从 `src/QueryEngine.ts` 与 `src/query.ts` 的职责划分来看，Query / conversation runtime 被明确当成可复用核心处理：

- 会话生命周期
- query 提交
- token / budget / compact / retry
- 工具调用与 tool result 回填
- session state 与 transcript 记录

这意味着 CLI、headless、SDK、server 可以共享同一运行时骨架。

### 4. Tool contract 和 ToolUseContext 是一级边界

`src/Tool.ts` 暗示工具不是零散函数集合，而是正式契约：

- 工具定义
- 工具发现 / 匹配
- 工具执行上下文
- 与 UI、状态、通知、elicitations 的桥接

对我们来说，重点不在于照抄类型名，而在于建立“工具协议层”的意识。

### 5. 学习材料必须回落到本仓库结构调整

如果只阅读外部源码却不形成本仓库映射，学习价值会很快衰减。真正要沉淀的是：

- 外部代码在解决什么结构问题
- 我们仓库当前哪里是对应关系
- 哪些地方差距最大
- 下一轮重构要先动哪一层

## 对当前仓库的映射

### 当前已有的正向基础

- `apps/agent-cli/src/cli.ts`
- `apps/agent-cli/src/server.ts`
- `apps/agent-cli/src/agent-service.ts`
- `apps/agent-cli/src/agent-loop.ts`
- `apps/agent-cli/src/tools/`
- `apps/agent-cli/src/observability/`
- `apps/agent-cli/src/memory/`
- `apps/agent-cli/src/prompt/`

这说明我们已经不是“没有结构”，而是已经有很多生产级模块雏形。

### 当前最明显的结构问题

#### 1. 缺少显式 composition root

CLI、HTTP service、调度和 runtime 初始化虽然可以工作，但共享依赖装配还不够集中，未来继续扩展会导致入口侧膨胀。

#### 2. `agent-loop.ts` 承担过多横切职责

当前主循环里混入了较多内容：

- 调度通知
- subagent / team / background 注入
- memory 注入
- observability
- delivery
- recovery
- autonomy

这些能力本身没有错，但需要逐步向更稳定的 runtime 边界拆分。

#### 3. tool router 已有雏形，但“协议层”还不够显式

现在已经有 native / subagent / MCP 的统一路由，但从长期看，还需要更明确的：

- tool registry
- tool execution contract
- policy gate chain
- replay / dry-run / observability context

#### 4. 学习内容还没有变成仓库内资产

之前的学习大多停留在对话中，没有形成持续可复用的 repository knowledge。

## 拟采纳的方向

### 阶段 1：知识基线 + 差距地图

- 固化学习文档
- 画清当前层次和目标层次
- 建立后续 change 的边界

### 阶段 2：共享装配与 runtime 边界

- 引入 bootstrap / composition root
- 让 CLI、HTTP service、未来 Web 接入共享应用服务装配
- 从入口层抽离 query runtime

### 阶段 3：工具协议层与运行时协同

- 强化 tool contract
- 显式化 tool registry / policy / execution / observability context
- 为后续 Web / SDK / remote 模式复用打底

## 当前不直接照搬的部分

- 不直接复制全部 UI / Ink / screen 体系
- 不直接复制上游的目录颗粒度和文件命名
- 不在单次重构中引入过多模式开关与实验特性

原因很简单：我们要的是“生产级方向正确”，不是“外形尽量相似”。

## 后续使用方式

每次进入新的生产级重构 change，都要在这类学习文档中补四件事：

1. 本轮参考了哪些源码或分析材料
2. 本轮识别出的结构差距是什么
3. 本轮实际采纳了哪些调整
4. 暂不采纳哪些内容，以及为什么
