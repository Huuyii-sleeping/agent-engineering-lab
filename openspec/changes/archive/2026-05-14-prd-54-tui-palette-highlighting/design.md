## Context

palette 现在已经有了 command bar 和 overlay-style results，但 query 命中信息和选中项上下文仍然不够突出。当前 renderer 仍然以纯文本为主，因此最稳妥的方式是通过轻量文本标记实现高亮，而不是引入更重的着色系统。

## Goals / Non-Goals

**Goals**

- 强化命中可见性。
- 强化选中项上下文。
- 保持现有 palette 交互语义不变。

**Non-Goals**

- 不做复杂色彩系统调整。
- 不改 palette ranking。
- 不增加新的键位协议。

## Decisions

### Decision 1: 用轻量 ASCII 标记命中

采纳：

- 使用 `<<match>>` 标记 query 命中。

原因：

- 终端环境稳定、无需依赖颜色能力、测试也更直接。

### Decision 2: 在 command bar 直接展示选中项 preview

采纳：

- 新增 `preview` 行，显示当前选中项 summary。

原因：

- 用户不需要再把视线完全移到结果块才能理解当前动作。

## Risks / Trade-offs

- [Risk] ASCII 高亮不如颜色细腻
  - Mitigation：先确保可见性和稳定性，后续如需要再加主题色强化
