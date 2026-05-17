## 1. 对照基线与状态模型

- [x] 1.1 将外部文档中的 8 类用户数据面映射到当前仓库能力与状态标签
- [x] 1.2 定义统一状态枚举：`已实现`、`部分等价`、`待实现`、`保留缺口`
- [x] 1.3 定义统一字段：数据类别、来源、用途、默认启用状态、保留/导出/删除语义、远端边界状态

## 2. 统一治理 capability

- [x] 2.1 新增 `user-data-governance-surface` spec，定义统一数据清单 requirement
- [x] 2.2 为治理面增加“未实现能力也必须显式登记”的 requirement
- [x] 2.3 为治理面增加“本地、出站、远端 ingress 必须分层披露”的 requirement

## 3. 现有本地能力的 disclosure 对齐

- [x] 3.1 为 `system-prompt-pipeline` 增加模型输入类别与 inclusion reason 的披露 requirement
- [x] 3.2 为 `agent-service-sessions` 增加 session/transcript/agent metadata 本地持久化合同披露 requirement
- [x] 3.3 为 `memory-knowledge-retrieval` 增加 memory 类型、注入来源、shared/team memory 支持状态披露 requirement
- [x] 3.4 为 `observability-replay-debug` 增加 local observability 与 remote analytics/export 的区分披露 requirement
- [x] 3.5 为 `agent-bridge-control-plane` 增加 bridge/remote ingress 边界扩展披露 requirement

## 4. 保留缺口登记

- [x] 4.1 将 account / organization / OAuth 身份数据面登记为 `reserved_gap`
- [x] 4.2 将 remote telemetry / analytics 隐私分层与组织级关闭开关登记为 `reserved_gap`
- [x] 4.3 将 shared team memory / team memory sync 的身份、隔离、加密与删除传播模型登记为 `reserved_gap`
- [x] 4.4 将 transcript 分享、训练改进类主动上传面登记为 `reserved_gap`

## 5. 验证与交付

- [x] 5.1 校验 proposal、design、specs、tasks 只归属于这一个 PRD，不再拆分第二个变更
- [x] 5.2 校验每一类外部文档数据面都在本 PRD 内被标记为已实现、部分等价、待实现或保留缺口之一
- [x] 5.3 校验现有 spec 修改只补治理 requirement，不伪造当前仓库并不存在的产品实现
