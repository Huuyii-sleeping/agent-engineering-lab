## Why

`06-extra-findings.md` 提醒了 Unicode 隐写类输入风险。本仓库已有 hidden control / bidi 清理，但当前实现未覆盖常见零宽格式字符，外部文本仍可能把不可见内容带入工具描述、工具输出、memory 或 observability payload。

本次变更以最小安全收益闭环补齐这一缺口，避免不可见零宽字符影响审计可读性、展示一致性和后续文本处理。

## What Changes

- 将常见 zero-width format characters 纳入外部文本入口清理范围。
- 保持既有 C0/C1 control、bidi control 和 secret-like 内容脱敏行为不变。
- 增加单元测试覆盖 `sanitizeAndRedactText` 的零宽字符清理。
- 增加 smoke 测试覆盖 `sanitizeAndRedactValue` 对嵌套外部文本的递归清理与脱敏组合路径。

### In Scope

- 清理 `U+200B`、`U+200C`、`U+200D`、`U+2060`、`U+FEFF`。
- 更新 `security-data-hygiene` 能力规范。
- 使用现有 `data-hygiene` 工具函数作为统一入口，不新增安全子系统。

### Out of Scope

- 不做 remote analytics PII 类型系统。
- 不做 swarm 状态回流。
- 不修改 MCP trust policy 或 include/trust 配置解析。
- 不做完整 Unicode confusable 检测或 normalization 策略。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `security-data-hygiene`: 外部文本入口清理范围扩展到常见零宽格式字符。

## Impact

- 影响代码：`apps/agent-cli/src/security/data-hygiene.ts`。
- 影响测试：`apps/agent-cli/test/unit/security/data-hygiene.test.ts`，新增 PRD-77 smoke 测试。
- 影响规范：`openspec/specs/security-data-hygiene/spec.md` 归档后应包含零宽格式字符清理要求。
- 无 API 破坏性变更，无新增依赖。
