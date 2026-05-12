# 共享 Query 运行时入口收口

## 这轮真正学到的东西

### 1. 共享装配之后，下一步就该收共享执行路径

如果 CLI 和 HTTP service 只是共用了默认依赖，但“提交一轮用户 query”这条路径仍各写一份，那么 runtime 还是没有真正独立出来。

所以第二轮最自然的动作不是继续扩 bootstrap，而是把这条共享路径显式抽出来。

### 2. query runtime 的第一步不是做完整引擎，而是先收一条稳定主链路

这轮没有直接重写 `agent-loop.ts`，也没有强行引入完整 `QueryEngine` 类，而是先把这条最核心的路径收敛出来：

- 处理 `UserPromptSubmit` hook
- 追加 system messages
- 追加 user message
- 解析工具清单
- 调用共享 loop runner
- 提取 assistant 文本结果

这一步的价值是：先让不同交互表面真正走同一条执行链。

### 3. runtime 独立的判断标准是“交互表面只做适配”

这轮之后，CLI 和 HTTP service 各自保留的东西更像是表面适配层：

- CLI 负责终端输入输出、prompt、busy 状态
- HTTP service 负责 session 管理和接口协议

真正的“一轮 query 怎么执行”已经开始往共享 runtime 里收。

## 这轮怎么映射到本仓库

### 原来的问题

- `cli.ts` 和 `agent-service.ts` 各自处理了一遍用户 query 提交主流程
- hook、history 追加、tools 解析、loop 调用这套逻辑重复存在
- 这会让后续继续拆 runtime 时改动面持续放大

### 这轮实际做的事

1. 新增 `runtime/query-runtime.ts`
2. 抽出共享 `runUserQuery(...)`
3. 让 CLI 改为调用共享 query runtime
4. 让 HTTP service 改为调用共享 query runtime
5. 补 `query-runtime` 单测，验证主路径行为

### 这轮没有做的事

- 还没有把 scheduler / scheduled round 也收进统一 query runtime
- 还没有拆 `agent-loop.ts` 内部横切职责
- 还没有整理 tool runtime 协议层

## 本轮采纳了什么

### 采纳

- 先提取共享 query 主路径，再继续缩小 `agent-loop.ts`
- 让不同交互表面只保留适配职责
- 用函数级共享 runtime 作为过渡，而不是一开始就上大而全的 runtime class

### 暂不采纳

- 不直接引入完整 `QueryEngine` 类结构
- 不在这轮顺手把 scheduler / background / autonomy 都并入 query runtime
- 不直接触碰 tool runtime

原因是这轮要解决的是“主路径重复”，不是“一次性解决所有 runtime 结构问题”。

## 这轮实际改成了什么

- 改了哪些核心结构：
  - 新增 `runUserQuery(...)`
  - CLI / HTTP service 共用同一条用户 query 执行主链
- 改完之后带来什么变化：
  - 重复逻辑减少
  - query 执行路径开始成为独立 runtime 边界
  - 下一轮继续缩小 `agent-loop.ts` 会更顺手
- 还有什么没收干净：
  - scheduled round 还是直接调用 loop runner
  - runtime 还没有形成更完整的 session/query 对象边界

## 下一步最自然的动作

1. 继续缩小 `agent-loop.ts` 的横切职责
2. 开始整理 tool runtime 的稳定契约
3. 在 agent 工具层边界更清楚之后，再承接 Web 展示层
