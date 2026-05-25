## 1. 测试先行

- [x] 1.1 新增 Ink scheduler controller 单元测试，覆盖 embedded runtime due prompt
- [x] 1.2 新增 Ink scheduler controller 单元测试，覆盖 daemon-backed service due prompt

## 2. 实现

- [x] 2.1 新增 `createInkRuntimeController()` 共享 submit 与 scheduled tick 状态
- [x] 2.2 在 `InkTuiPreviewApp` 中按 scheduler interval 追加异步提醒消息
- [x] 2.3 Embedded runtime 路径复用 `runScheduledRound`
- [x] 2.4 Daemon-backed service 路径通过 `service.chat()` 处理 due prompt

## 3. 验证与收口

- [x] 3.1 运行相关单元测试、Ink smoke 和 `pnpm build`
- [x] 3.2 运行 `openspec validate`、`openspec status`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
