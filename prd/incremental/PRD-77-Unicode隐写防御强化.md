# PRD-77 Unicode 隐写防御强化

## 背景

对比 `06-extra-findings.md` 后，仓库在 trust policy、MCP 外部能力、隐私最小化和观测链路上已有分层规范，且 `security-data-hygiene` 已要求外部文本入口清理 hidden control / bidi 字符。

当前实现仍有一个明确缺口：`sanitizeVisibleText` 只删除 C0/C1 control 与 bidi 控制字符，没有覆盖常见零宽格式字符，例如 `U+200B`、`U+200C`、`U+200D`、`U+2060`、`U+FEFF`。这些字符不可见但会改变文本边界、标识符展示或审计可读性，适合作为本轮最小闭环强化。

## 目标

- 外部文本进入本地 runtime 前，统一移除常见零宽格式字符。
- 保持现有 hidden control、bidi control 和 secret redaction 行为不退化。
- 通过单元测试和 smoke 测试证明 MCP-like 外部文本路径不会保留零宽字符。

## In Scope

- 扩展 `apps/agent-cli/src/security/data-hygiene.ts` 的可见文本清理规则。
- 增加 `apps/agent-cli/test/unit/security/data-hygiene.test.ts` 覆盖零宽格式字符清理。
- 增加 PRD-77 smoke 测试，覆盖结构化外部文本的递归清理与脱敏组合路径。
- 更新 `security-data-hygiene` OpenSpec delta，明确 hidden Unicode format characters 属于外部文本入口清理范围。

## Out of Scope

- 不实现 remote analytics PII 类型屏障。
- 不实现 swarm 状态回流或子代理状态后端。
- 不修改 MCP trust policy、AGENTS/CLAUDE include 解析或权限模型。
- 不引入 Unicode normalization、混淆字符检测或脚本相似度检测。

## 验收标准

- `sanitizeAndRedactText` 会移除 `U+200B`、`U+200C`、`U+200D`、`U+2060`、`U+FEFF`。
- `sanitizeAndRedactValue` 对嵌套对象与数组中的字符串同样移除上述零宽字符。
- 现有 secret redaction、bidi control 清理与 stable scope hash 测试保持通过。
- OpenSpec change 可通过 `openspec validate`。
- 项目通过 `pnpm build`。
