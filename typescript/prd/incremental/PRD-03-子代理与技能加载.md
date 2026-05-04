# PRD-03 子代理与技能加载

## 目标

让 Agent 支持“分治执行”和“按需加载外部能力说明”。

## 范围（In Scope）

- `task(prompt, description?)` + `runSubagent(prompt)`（对应 S04）。
- `SkillLoader` + `load_skill(name)`（对应 S05）。

## 非目标（Out of Scope）

- 团队多代理、协议审批、worktree。

## 功能要求

- 子代理使用独立上下文，最多 30 轮。
- 子代理仅允许基础工具，不允许递归 `task`。
- 父代理只接收子代理最终摘要。
- 支持扫描 `skills/**/SKILL.md`，并解析 frontmatter 元数据。
- `load_skill(name)` 返回完整技能正文。

## 验收标准（AC）

- AC-03-1：父代理可成功派发并回收子代理摘要。
- AC-03-2：子代理不能再次调用 `task`。
- AC-03-3：可按名称加载技能并返回内容。

## 实施顺序

1. 先完成 `runSubagent`（独立消息历史 + 上限控制）。
2. 再完成 `SkillLoader`（扫描 + 解析 + 查询）。
3. 集成工具并跑端到端委派用例。

