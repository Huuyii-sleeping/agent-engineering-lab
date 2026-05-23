## Context

`security-data-hygiene` 已提供统一的外部文本清理与脱敏入口：`sanitizeVisibleText` 负责不可见字符清理，`sanitizeAndRedactText` 与 `sanitizeAndRedactValue` 在此基础上做 secret redaction 和递归处理。MCP tool description/output、memory、prompt inspect、observability 等路径已经复用这些函数。

当前清理范围包含 C0/C1 hidden control characters 与 bidi control characters，但未包含常见零宽格式字符。由于这些字符在显示上不可见，仍可能被外部 MCP、工具输出或用户输入带入本地 runtime，并影响审计文本的可读性。

## Goals / Non-Goals

**Goals:**

- 在统一入口中移除常见 zero-width format characters。
- 保持现有调用方无需改造，所有已复用 `sanitizeAndRedactText` / `sanitizeAndRedactValue` 的路径自然获得强化。
- 通过单元测试和 smoke 测试证明文本与嵌套结构都被清理。

**Non-Goals:**

- 不做 Unicode normalization 或 confusable 字符检测。
- 不改变 secret redaction 规则。
- 不新增外部依赖。
- 不改动 MCP trust policy、analytics、swarm 或 include 配置逻辑。

## Decisions

### Decision 1: 在 `sanitizeVisibleText` 中扩展正则清理范围

选择：新增独立的 zero-width format 正则，并在 `sanitizeVisibleText` 中串联执行。

理由：现有调用方已经以 `sanitizeVisibleText` 作为可见文本清洗边界，扩展该函数可以最小化改动面，同时覆盖 MCP、memory、prompt inspect、observability 等已接入路径。

备选方案：在 MCP protocol、memory、observability 各调用点分别清理。未采用原因是会复制规则，容易产生入口覆盖不一致。

### Decision 2: 只清理明确列出的零宽格式字符

选择：本轮清理 `U+200B`、`U+200C`、`U+200D`、`U+2060`、`U+FEFF`。

理由：这些字符是常见文本隐写载体，且移除后对当前 CLI runtime 的安全审计收益明确。保留普通可见 Unicode 文本，避免误伤 CJK、emoji 或合法非拉丁文本。

备选方案：删除所有 Unicode `Cf` 类字符。未采用原因是 `Cf` 范围更大，可能影响合法语言排版或协议字段，超出本轮最小闭环。

### Decision 3: 使用 TDD 覆盖文本与嵌套值两条路径

选择：先新增单元测试证明 `sanitizeAndRedactText` 当前会泄漏零宽字符，再实现；随后增加 smoke 测试覆盖 `sanitizeAndRedactValue` 的数组/对象递归路径。

理由：单元测试锁定核心函数行为，smoke 测试证明外部 payload 类结构可以通过统一入口清理，不需要构造完整 MCP server。

## Risks / Trade-offs

- [Risk] `U+200D` 在部分自然语言或 emoji 序列中可能有展示意义。→ Mitigation：本函数定位为外部文本进入本地 runtime 前的安全清理入口，不用于富文本渲染或保真编辑。
- [Risk] 只列出五类零宽字符，不能覆盖所有 Unicode 隐写技术。→ Mitigation：本轮按 PRD 最小闭环处理高频隐形字符，后续如需要可单独评估 normalization/confusable 检测。
- [Risk] 主规范已有历史编码问题。→ Mitigation：本轮只通过 delta 更新相关 requirement，不做无关全文修复。

## Migration Plan

无需数据迁移。上线后新进入本地 runtime 的外部文本会被清理；历史已落盘内容不在本轮范围内回写。

## Open Questions

无。
