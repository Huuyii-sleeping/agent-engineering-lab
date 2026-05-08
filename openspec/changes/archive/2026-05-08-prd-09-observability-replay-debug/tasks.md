## 1. Artifacts

- [x] 1.1 proposal/design/specs 完成

## 2. Implementation

- [x] 2.1 新增 observability runtime，支持 events.jsonl 与 metrics.json 落盘
- [x] 2.2 在主循环与工具执行入口接入 trace_id/span_id 和结构化事件
- [x] 2.3 为后台任务、子代理通知和安全阻断补充观测事件
- [x] 2.4 实现按 `trace_id` 回放的 replay runner，并默认 dry-run 阻断副作用
- [x] 2.5 增加 PRD-09 smoke 脚本与必要命令入口

## 3. Validation

- [x] 3.1 `npm run build` 通过
- [x] 3.2 `npm run test:regression` 与新增 `npm run test:observability` 通过
- [x] 3.3 `openspec status/validate` 通过
