## 1. bridge state 与 host event replay

- [x] 1.1 为 `AgentHost` 增加有限事件缓冲和按 cursor 读取能力
- [x] 1.2 为 HTTP bridge 增加 `/bridge/state` 和支持 replay 的 `/events` 协议

## 2. client 与控制面适配

- [x] 2.1 扩展 `AgentServiceClient` 与 daemon resolver，支持读取 bridge state
- [x] 2.2 保持现有 attach 行为不回退，同时复用新的 bridge control plane 探测

## 3. 验证与收口

- [x] 3.1 补充 host/service-api/unit tests，覆盖 bridge state 与 event replay
- [x] 3.2 增加 smoke 或 focused integration 验证，确认 daemon-backed bridge 控制链路可用
- [x] 3.3 更新 README / 主 specs / tasks 状态，并完成 strict 验证
