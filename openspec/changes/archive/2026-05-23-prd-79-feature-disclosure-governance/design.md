## Context

本仓库已有 `/help`、`/palette`、`/workflow`、`/data`、`/architecture`、`/skills`、`/prompt` 等本地控制面，但功能披露分散在 UI、palette 和治理文档里。`11-hidden-features-and-easter-eggs.md` 提醒隐藏命令、彩蛋、beta-only surface 需要治理；本仓库当前更适合先补一个“没有隐藏能力也要明说”的本地清单。

## Goals / Non-Goals

**Goals:**

- 增加本地 feature disclosure registry。
- 通过 `/features` 输出功能可见性、稳定性、入口命令和 reserved gap。
- 将 `/features` 纳入 help 与 palette，避免披露入口本身不可发现。
- 明确当前没有启用的隐藏命令、隐藏彩蛋或 beta-only header surface。

**Non-Goals:**

- 不新增隐藏命令、彩蛋或 persona。
- 不实现远端 feature flag service。
- 不改变现有命令行为、权限模型或 palette 执行语义。

## Decisions

### Decision 1: 新增静态 registry，而不是从命令分发表反射生成

选择：新增 `cli/features.ts`，维护一份人工审计的 feature disclosure registry。

理由：披露清单不仅包含命令，还包含 reserved gap、稳定性和治理说明，不能只从命令分发表推导。静态 registry 更容易在 code review 中审查新增能力是否被登记。

备选方案：从 `dispatchCliCommand` 或 palette candidate 自动生成。未采用原因是缺少稳定性、可见性、reserved gap 等治理字段。

### Decision 2: `/features` 只做本地披露，不做能力开关

选择：`/features` 只读取 registry 并渲染，不改变配置、不启用实验、不写入状态。

理由：本轮目标是透明度和审计，不引入 feature flag 机制。把披露与启用分离，可以避免把 reserved gap 误实现成可用开关。

备选方案：同时提供 enable/disable 子命令。未采用原因是当前没有真实实验能力需要切换，且会扩大权限和配置范围。

### Decision 3: 显式报告 hidden/easter/beta 计数

选择：渲染输出中包含 `hidden commands: none registered`、`easter eggs: none registered`、`beta-only surfaces: reserved gap` 等摘要。

理由：用户和维护者需要快速判断是否存在隐藏面，而不是从长列表中推断。

## Risks / Trade-offs

- [Risk] 静态 registry 可能随着新增命令而过期。→ Mitigation：新增单元测试要求 `/features`、help、palette 同步暴露，后续新增能力时需要补 registry。
- [Risk] 披露清单可能被误解为 feature flag。→ Mitigation：字段命名使用 `visibility`、`stability`、`status`，不提供 enable/disable。
- [Risk] 主规范已有历史编码问题。→ Mitigation：本轮只追加新增 requirement，不做无关全文修复。

## Migration Plan

无需数据迁移。新增 `/features` 是本地只读命令，历史会话和配置不受影响。

## Open Questions

无。
