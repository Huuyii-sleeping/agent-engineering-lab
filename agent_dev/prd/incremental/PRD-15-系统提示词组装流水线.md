# PRD-15 系统提示词组装流水线

## 目标

把当前分散的 system prompt、memory、skills、长期规则和动态提醒，收敛为一条清晰的“组装流水线”。

## 范围（In Scope）

- `SystemPromptBuilder`。
- 6 段输入模型：
  - core
  - tools
  - skills
  - memory
  - `CLAUDE.md` / 长期规则链
  - dynamic context
- 稳定段与动态段分离。
- `system reminder` 与主 `system prompt` 的边界定义。

## 非目标（Out of Scope）

- 复杂 prompt 模板 DSL。
- 提示词缓存优化与成本治理细节。

## 功能要求

- system prompt 不能只是一整块硬编码文本。
- 每一段必须有单一来源和单一职责。
- memory 必须通过 prompt 组装链条真正进入模型输入。
- 动态提醒（如日期、cwd、当前模式、本轮临时上下文）应与稳定规则分离。
- 支持多层长期规则来源叠加，而不是简单覆盖。

## 验收标准（AC）

- AC-15-1：可单独测试每个 prompt section 的生成逻辑。
- AC-15-2：稳定规则与动态提醒不会混成一段难以维护的大字符串。
- AC-15-3：skills、memory、长期规则都能明确进入最终模型输入。
- AC-15-4：新增一种 prompt 来源时，无需重写整条拼装逻辑。

## 实施顺序

1. 先抽出 `SystemPromptBuilder`。
2. 再按来源拆 `core/tools/skills/memory/rules/dynamic`。
3. 最后整理主循环里的 system prompt 与 reminder 注入边界。
