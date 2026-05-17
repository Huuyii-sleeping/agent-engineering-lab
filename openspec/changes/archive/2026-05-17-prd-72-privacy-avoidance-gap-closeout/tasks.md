## 1. 统一隐私控制建模

- [x] 1.1 新增 `privacy-minimization-controls` spec，定义 persistence、memory、observability、remote attach、external capabilities 五类控制面
- [x] 1.2 在该 spec 中明确当前未实现但必须保留的 `reserved_gap`，包括 remote telemetry privacy tiers、org policy、team memory sync、training uploads

## 2. 本地最小化控制接线

- [x] 2.1 为 `local-data-retention-controls` 增加 no-persistence / zero-retention override contract
- [x] 2.2 为 `memory-knowledge-retrieval` 增加 auto extract / inject disable contract
- [x] 2.3 为 `observability-replay-debug` 增加 minimized / disabled local observability contract
- [x] 2.4 为 `agent-host-daemon-runtime` 增加 `local_only` non-attach contract
- [x] 2.5 为 `mcp-external-capability-bus` 增加 disabled / allowlist external capability contract

## 3. 治理与 inspection 对齐

- [x] 3.1 为 `system-prompt-pipeline` 增加“被隐私姿态抑制的模型输入类别必须可披露”的 requirement
- [x] 3.2 为 `user-data-governance-surface` 增加“当前隐私姿态与未实现控制缺口”的统一披露 requirement

## 4. 后续实现落地

- [x] 4.1 在运行时配置层接入统一隐私控制状态，并定义默认值与显式 override 语义
- [x] 4.2 在 query preparation、daemon attach、observability、MCP loading 等路径上落实控制面
- [x] 4.3 为各控制面补充单元测试和回归验证，确保关闭状态不会被旁路绕过
