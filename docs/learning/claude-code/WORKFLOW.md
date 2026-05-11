# 生产级重构工作流

## 目标

把“外部 Claude Code 源码学习 + 本仓库生产级重构 + 知识沉淀”固定成一套长期可复用流程。

## 参考优先级

1. 外部 `src/` 实际源码
2. 外部配套解析文章
3. 本仓库当前可运行实现
4. 本地教学源码 `typescript/`

## 每轮标准流程

1. 用户提供本轮讲解内容或主题。
2. 先阅读外部 `src/` 对应模块，再阅读配套解析文章。
3. 映射到本仓库当前实现，输出差距分析。
4. 生成或更新对应 `PRD` 与 `OpenSpec change`。
5. 在明确 In Scope 后实施重构或实现。
6. 运行验证，修复本轮打出的真实回归。
7. 产出或更新知识沉淀文档，记录采纳与未采纳结论。
8. 如用户需要，提交 commit。

## 每轮必备产物

- `PRD`
- `OpenSpec artifacts`
- 代码实现或重构结果
- 学习沉淀文档
- 验证结果

## 决策原则

- 优先学习外部源码“怎么写”，而不是只看别人“怎么讲”。
- 外部实现不是照抄模板，必须经过本仓库差距分析和适配。
- 不做大爆炸式重构；每轮只解决一段明确差距。
- 每轮必须记录“采纳了什么、没采纳什么、为什么”。

## 文档约定

- 学习沉淀文档使用 [TEMPLATE-architecture-learning-note.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/TEMPLATE-architecture-learning-note.md)。
- 用户每轮输入可参考 [TEMPLATE-round-input.md](/Users/bytedance/Personal/agent-engineering-lab-web/docs/learning/claude-code/TEMPLATE-round-input.md)。
