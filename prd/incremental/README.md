# 增量 PRD 路线图

目标：将 `agent_prd.md` 的全量能力拆分为可独立交付的小 PRD，按阶段实现、按阶段验收。

## 使用方式

1. 每次只实现一个 PRD，避免范围膨胀。
2. 当前 PRD 验收通过后再进入下一阶段。
3. 未进入阶段的能力统一视为 `Out of Scope`。

## 已有阶段（PRD-00 ~ PRD-06）

- PRD-00：核心循环与最小可用 Agent（S01）
- PRD-01：多工具与文件操作（S02）
- PRD-02：任务可视化与持久化（S03 + S07）
- PRD-03：子代理与技能加载（S04 + S05）
- PRD-04：上下文压缩与后台任务（S06 + S08）
- PRD-05：团队通信与协议（S09 + S10）
- PRD-06：自治与 Worktree 隔离（S11 + S12）

## 现阶段优先级策略

- **P0**：先做“完善现有功能”
  - PRD-13：功能完善与稳定性加固
- **P1 及以后**：再做新增能力扩展（PRD-07 ~ PRD-12）

## 新增能力路线（P1+）

- PRD-07：安全治理与权限边界
- PRD-08：记忆与知识检索层
- PRD-09：可观测性与回放调试
- PRD-10：交付质量与自动验证闭环
- PRD-11：模型策略与成本性能治理
- PRD-12：产品化接口与生态扩展
- PRD-14：Hook 系统与统一扩展点
- PRD-15：系统提示词组装流水线
- PRD-16：错误恢复与弹性重试
- PRD-17：定时调度与未来任务注入
- PRD-18：Worktree 执行车道与收尾模型增强
- PRD-19：MCP 与外部能力总线

## 生产级架构与收口阶段

- PRD-20：发布硬化与收口
- PRD-21：生产级架构重构与知识沉淀
- PRD-22：运行时服务目录与边界校正
- PRD-23：Query 运行时 Services 依赖包
- PRD-24：ToolService 协议边界二次收口
- PRD-25：ToolExecutor 执行分发边界收口
- PRD-26：MCP 模块边界拆分
- PRD-27：MCP 客户端与 Registry 边界拆分
- PRD-28：Security 工具模块边界收口
- PRD-29：Team 工具模块边界收口
- PRD-30：Worktree 工具模块边界收口
- PRD-31：TaskBoard 任务模块边界收口
- PRD-32：Scheduler 调度模块边界收口
- PRD-33：BackgroundTask 后台任务模块边界收口
- PRD-34：Subagent 子代理模块边界收口
- PRD-35：Delivery 交付验证模块边界收口
- PRD-36：QueryModel 模型请求模块边界收口
- PRD-37：QueryToolStage 工具执行阶段边界收口
- PRD-38：QueryFinalization 收尾阶段边界收口
- PRD-39：Runtime 剩余编排边界总收口
- PRD-40：最终发布收口与文档一致性

PRD-39 之后，不再为了拆分而继续开边界收口 PRD。后续新 PRD 应围绕明确的新能力、行为变化、发布门禁调整或产品化需求展开。

## 建议执行顺序

1. PRD-13（P0）
2. PRD-07
3. PRD-14
4. PRD-08
5. PRD-15
6. PRD-16
7. PRD-10
8. PRD-09
9. PRD-11
10. PRD-17
11. PRD-18
12. PRD-12
13. PRD-19

## 进入下一阶段门槛

- 当前阶段 AC 全部通过
- 关键风险已记录
- CLI 主流程保持稳定可运行
- OpenSpec active changes 清空
- 必要时更新 `docs/learning/claude-code/operations/` 中对应操作类型文档
