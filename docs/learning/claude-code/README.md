# Claude Code 学习沉淀阅读入口

这组文档现在分两层：

1. **主阅读路径：按统一操作类型组织**
   - 放在 `operations/` 目录。
   - 目标是帮助讲清楚这个项目：为什么这样分层、怎么做、优缺点是什么。
   - 后续优先维护这一层。

2. **历史执行记录：按 PRD 轮次组织**
   - `01-*.md` 到 `26-*.md` 是每轮执行过程的沉淀。
   - 这些文档用于追溯“某一轮改了什么”，不是讲项目架构的主材料。

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
- 每篇文档重点回答：
  - 为什么要这么做
  - 怎么做
  - 适用场景
  - 优点
  - 代价和风险
  - 如何用它讲清楚项目
