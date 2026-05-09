# PRD-16 错误恢复与弹性重试

## 目标

让 Agent 在常见可恢复失败下能自动续行，而不是一出错就直接中断。

## 范围（In Scope）

- 恢复分类器（Recovery Selector）。
- 最小恢复状态：
  - `continuation_attempts`
  - `compact_attempts`
  - `transport_attempts`
- 三条恢复路径：
  - 输出截断续写
  - 上下文过长压缩后重试
  - 临时连接错误 backoff 后重试

## 非目标（Out of Scope）

- 任意错误的自动自愈。
- 复杂跨节点容灾体系。

## 功能要求

- `stop_reason == max_tokens` 时，支持注入续写提示而不是从头再来。
- prompt 超长时，优先触发压缩，再重试请求。
- timeout / rate limit / unavailable / connection 这类瞬时错误支持退避重试。
- 每条恢复路径必须有各自预算，避免无限重试。
- 恢复决策需要显式结构化：`continue | compact | backoff | fail`。

## 验收标准（AC）

- AC-16-1：输出截断时，Agent 能续写而不是重复前文。
- AC-16-2：上下文过长时，Agent 能先压缩再继续。
- AC-16-3：临时 API 抖动时，Agent 能在预算内自动重试。
- AC-16-4：不可恢复错误会被明确终止并返回原因，而不是死循环。

## 实施顺序

1. 先实现错误分类与恢复决策结构。
2. 再接续写、压缩、backoff 三条恢复路径。
3. 最后补预算控制、日志和验证用例。
