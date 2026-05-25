# PRD-85 Scheduled Prompt 主动消费隔离

## 背景

Ink CLI 已经有后台 scheduler loop，但普通用户请求的 `prepareQueryRound()` 也会 tick scheduler 并 drain pending scheduled notifications。用户设置 `1s` 提醒时，scheduled prompt 会在“设置提醒”这一轮内部被提前注入和消费，导致后续后台 loop 查不到 due prompt，无法主动显示“提醒喝水”。

## 目标

- 普通用户 query round 不再消费 scheduled prompt。
- 主动 scheduled round 显式消费 scheduled prompt。
- daemon-backed scheduled round 通过 `chat()` 显式请求消费 scheduled prompt。
- 保留 subagent/background/team 通知在普通 query round 中的动态注入能力。

## 非目标

- 不修改 cron 匹配规则。
- 不修改 scheduler 持久化结构。

## 验收标准

- 单元测试证明普通 query preparation 使用 `includeScheduled: false`。
- 单元测试证明 scheduled round 使用 `includeScheduled: true`。
- Ink scheduler、旧 CLI scheduler、notification 单元测试通过。
