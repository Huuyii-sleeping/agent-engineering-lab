## 1. 测试

- [x] 1.1 补 query preparation 测试，证明普通轮次 `includeScheduled: false`
- [x] 1.2 补 query preparation 测试，证明 scheduled 轮次 `includeScheduled: true`
- [x] 1.3 补 query notifications 测试，证明 includeScheduled 参数会透传到 notification service
- [x] 1.4 更新 Ink daemon-backed scheduled tick 测试，断言 chat 请求携带 `include_scheduled_notifications`

## 2. 实现

- [x] 2.1 `NotificationServiceLike` 增加 `includeScheduled` drain 选项
- [x] 2.2 `prepareQueryRound()` 默认不消费 scheduled notifications
- [x] 2.3 `QueryEngineRunInput` 和 `runUserQuery()` 透传 scheduled consumption 选项
- [x] 2.4 `runScheduledRound()` 显式启用 scheduled consumption
- [x] 2.5 daemon-backed Ink scheduled tick 显式请求远端消费 scheduled notifications

## 3. 验证与收口

- [x] 3.1 运行相关单元测试、Ink smoke 和 `pnpm build`
- [x] 3.2 运行 `openspec validate`、`openspec status`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
