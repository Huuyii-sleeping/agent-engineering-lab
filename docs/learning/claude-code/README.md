# Claude Code 学习沉淀阅读入口

这组文档只维护一条主阅读路径：按统一操作类型组织。

文档放在 `operations/` 目录，目标是帮助讲清楚这个项目：为什么这样分层、怎么做、优缺点是什么。后续所有学习沉淀都应优先更新这里，而不是按 PRD 轮次写流水账。

## 推荐阅读顺序

1. [operations/01-组合根与运行时装配.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/01-组合根与运行时装配.md)
2. [operations/02-Agent主循环阶段化.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/02-Agent主循环阶段化.md)
3. [operations/03-工具能力边界.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/03-工具能力边界.md)
4. [operations/04-异步协作与任务运行时.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/04-异步协作与任务运行时.md)
5. [operations/05-质量验证与交付闭环.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/05-质量验证与交付闭环.md)
6. [operations/06-规格驱动与收口工作法.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/operations/06-规格驱动与收口工作法.md)

## 后续文档原则

- 不再为每一次小拆分单独写一篇“流水账学习文档”。
- 一个文档对应一种长期可复用的操作类型。
- PRD 和 OpenSpec 只记录变更范围与验收，不承担架构讲解主文档职责。
- 每篇文档重点回答：
  - 为什么要这么做
  - 怎么做
  - 适用场景
  - 优点
  - 代价和风险
  - 如何用它讲清楚项目
