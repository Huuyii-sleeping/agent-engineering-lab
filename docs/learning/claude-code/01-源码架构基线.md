# Claude Code 源码架构基线

## 核心认识

### 1. 入口层的价值不是承载业务，而是负责装配和分发

外部 `src/main.tsx` 给出的最强信号不是“入口文件很大”，而是：

- 入口可以复杂，但复杂点应该落在装配、模式分发和启动流程上
- 入口不该继续吞并 query runtime、tool runtime 这类核心执行逻辑
- 真正要复用的东西，不应该绑死在 CLI 或某个入口上

### 2. 真正可用的工具一定有稳定分层

外部 `src/` 目录体现出来的不是“文件多”，而是分层稳定：

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

这说明一个真实工具不是把功能全做出来就够了，而是要先回答每类职责应该归到哪一层。

### 3. QueryEngine 这类核心运行时必须是可复用骨架

从 `src/QueryEngine.ts`、`src/query.ts` 这类模块能看出，query runtime 处理的是：

- 会话生命周期
- query 提交
- token / budget / compact / retry
- 工具调用与 tool result 回填
- session state 与 transcript 记录

这类东西不该依附在某个入口里，而应该成为 CLI、HTTP、未来 Web 甚至 SDK 都能复用的骨架。

### 4. 工具不是零散函数集合，而是正式协议层

`src/Tool.ts` 传递出的重点不是某个具体类型名，而是这几个结构意识：

- 工具定义
- 工具发现 / 匹配
- 工具执行上下文
- 与 UI、状态、通知、elicitations 的桥接

对我们来说，重点不是照抄，而是把“工具协议层”明确出来。

## 对当前仓库最直接的启发

### 1. 当前仓库不是没结构，而是结构还不够稳

我们已经有这些正向基础：

- `apps/agent-cli/src/cli.ts`
- `apps/agent-cli/src/server.ts`
- `apps/agent-cli/src/agent-service.ts`
- `apps/agent-cli/src/agent-loop.ts`
- `apps/agent-cli/src/tools/`
- `apps/agent-cli/src/observability/`
- `apps/agent-cli/src/memory/`
- `apps/agent-cli/src/prompt/`

这说明仓库已经长出了不少生产级模块雏形，但“哪些是边界、哪些只是暂时挤在一起”还没有完全收清。

### 2. 当前最大的问题不是功能不够，而是职责还混得太近

最明显的几个问题是：

- 缺少显式 composition root
- `agent-loop.ts` 承担了太多横切职责
- tool router 已经有了，但工具协议层还不够显式
- 学习内容以前没有沉淀成仓库资产

也就是说，下一步不是继续补功能，而是先把边界慢慢拉开。

## 现在应该怎么做

### 第一阶段：先把装配和差距地图收清

- 固化学习文档
- 画清当前层次和目标层次
- 先补 bootstrap / composition root

### 第二阶段：再抽 query runtime

- 把主循环和入口分开
- 让 query runtime 成为真正可复用骨架
- 为 CLI / HTTP / Web 共用打底

### 第三阶段：再把工具层收成协议层

- 强化 tool contract
- 显式化注册、路由、权限、观测、执行上下文
- 让 native / subagent / MCP 真正归到一条稳定链路上

## 明确不照搬的部分

- 不直接复制全部 UI / Ink / screen 体系
- 不直接复制上游的目录颗粒度
- 不为了“像上游”而引入暂时用不上的复杂度

要学的是结构和边界，不是外形。
