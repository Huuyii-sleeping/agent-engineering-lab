## Context

当前仓库对照外部安全分析文档，呈现出三类状态：

1. 已有基础能力：
   - 本地 approval / audit / policy gate
   - 本地 session persistence、transcript snapshot、prompt dump、memory、observability
   - MCP 统一接入与最小输出卫生
   - 文件工具工作区边界校验
2. 只做到局部等价、但仍不足以视为“完成”的能力：
   - session / transcript / prompt dump 的脱敏、保留期、删除与导出边界
   - `.memory`、`.observability`、`.security`、`.audit`、`.sessions`、`.transcripts` 的统一 retention / cleanup
   - 文件工具的 symlink / `realpath` 逃逸、敏感路径 denylist、受管写入策略
   - MCP server 的 trust / provenance / capability allowlist / auth material 暴露边界
   - secret-like 内容在工具输出、workspace 写副作用与交付前的全链路扫描
3. 当前仓库尚未产品化的缺口：
   - 系统级 namespace / seccomp / bwrap 类 sandbox
   - 云 telemetry 的隐私分层、essential-only 模式和组织级关闭开关
   - 远端 Team Memory / shared memory sync 的身份、隔离、加密与删除模型

这说明问题已经不是“有没有安全功能”，而是“安全面零散、落盘治理不一致、信任边界没有完整闭环”。因此这次不再按单点补丁写 PRD，而是做一份总收口设计：把本地可落地 requirement 和暂时保留的架构缺口放进同一个变更，并明确优先级。

## Goals / Non-Goals

**Goals:**

- 明确外部安全分析文档与当前仓库之间的完整差距
- 把本地可落地差距收敛成可实施的 requirement 与任务分组
- 为持久化数据、路径边界、MCP 信任、prompt/transcript 暴露面和 DLP 建立统一治理框架
- 对暂时无法在当前仓库直接实现的能力保留明确缺口，而不是隐含跳过

**Non-Goals:**

- 本轮直接实现所有能力
- 在没有单独设计的情况下接入云端 telemetry 或远端 memory 服务
- 把系统级 sandbox 细节直接塞进现有 shell / tool runtime 里草率落地
- 引入重型外部安全平台再倒推本地架构

## Decisions

### 1. 用“本地可落地”与“产品面缺口”双层结构收口，而不是只写当前能做的事情

决策：

- 本 PRD 主体分成两组：
  - 本地可落地差距
  - 产品面 / 架构面缺口
- 前者进入可实施 spec 与任务，后者进入显式 backlog 与后续 PRD 入口

原因：

- 用户要求“完整”，而不是“只看当前代码能改什么”
- 只写可落地部分会让系统级 sandbox、云 telemetry、远端 Team Memory 这些关键差距再次丢失

备选方案：

- 只记录当前仓库能直接改的本地问题
- 不采用原因：会继续制造“文档说了但仓库没有登记”的盲区

### 2. 用统一的 local data retention capability 管理所有本地持久化面，而不是分别在每个模块各补一条 TTL

决策：

- 新增 `local-data-retention-controls`
- 统一覆盖 `.sessions`、`.transcripts`、`.memory`、`.observability`、`.security`、`.audit`
- 每个已有能力只补“如何接入 retention contract”，不各自重复定义生命周期规则

原因：

- 当前缺口本质上是跨 sink 的持久化治理问题
- 如果把 TTL / cleanup / delete 规则散在多个 spec，后续会再次漂移

备选方案：

- 在 session、memory、observability、transcript 各自 spec 单独增加 retention 条款
- 不采用原因：规则会重复，且难以保证默认值、清理方式和删除语义一致

### 3. Transcript、session 与 prompt dump 统一按“受保护导出面”处理，而不是继续把它们视作普通本地文件

决策：

- 把 `.sessions`、`.transcripts` 和 prompt dump 视为高敏感本地数据面
- requirement 上增加：
  - 默认脱敏/最小暴露
  - 明确访问入口
  - 生命周期清理
  - 显式导出/删除语义

原因：

- 当前仓库虽然是本地优先，但这三类文件直接包含历史消息、system prompt 和运行时上下文
- 它们与普通配置文件不是同一敏感等级

备选方案：

- 继续只在 ingress/sink 上做最小脱敏，不改变这些表面的定位
- 不采用原因：无法回答“这些高敏感本地文件保留多久、谁能导出、何时清理”

### 4. 文件工具边界升级为 symlink-safe realpath policy，而不是继续仅依赖 `path.resolve`

决策：

- 在 `multi-tool-file-ops` 增加 `realpath`/symlink 安全要求
- 增加敏感路径 denylist 与受管写入模式
- 对路径提升、越界重定向和工作区逃逸保留可审计结果

原因：

- 当前实现主要基于 `path.resolve` + root containment
- 这不足以覆盖 symlink 指向工作区外、敏感目录被挂载进工作区等情况

备选方案：

- 继续维持现有 `path.resolve` 检查
- 不采用原因：这正是典型“看起来有边界、实际上仍可绕”的本地文件安全缺口

### 5. MCP 差距按“信任来源 + 能力 provenance + 认证材料最小暴露”补齐，而不是只继续清洗输出文本

决策：

- 保留现有 metadata/output sanitization
- 追加 requirement：
  - server 来源与身份可见
  - capability allowlist / trust policy
  - auth material 不直出到本地工具层与日志
  - 工具注册结果携带 provenance 摘要

原因：

- 现状主要解决“内容干净不干净”
- 但外部安全文档强调的另一半问题是“这个能力从哪来、我为什么信它、它持有什么凭据”

备选方案：

- 只扩展现有文本 sanitation 规则
- 不采用原因：只能降低内容风险，不能建立外部能力接入的信任模型

### 6. Secret scanning / DLP 需要成为独立 capability，而不是继续依赖零散 redaction

决策：

- 新增 `secret-scanning-dlp-guards`
- 以三层扫描组织：
  - 工具输出进入会话前
  - workspace 写副作用产生后
  - 交付验证 / 提交前
- 输出可以是阻断、降级、告警或仅审计

原因：

- 现有 hygiene 更接近“已知模式脱敏”
- 外部文档中的目标态包含“发现新泄漏并阻断扩散”，这不是同一层能力

备选方案：

- 继续扩展 redact regex
- 不采用原因：regex 脱敏无法覆盖“文件已被写出但尚未发现”的场景

### 7. 系统级 sandbox、云 telemetry 隐私分层、远端 Team Memory sync 先登记为一级缺口，不伪装成本地任务

决策：

- 这些能力在本 PRD 中进入“保留缺口”分组
- 只定义后续拆分原则、依赖前提和验收目标，不纳入当前增量实现范围

原因：

- 三者都需要更高一级的运行时或产品面设计
- 现在硬做，会把本地 runtime、安全策略和部署模型搅在一起

备选方案：

- 在当前 PRD 里直接拆成实现任务
- 不采用原因：会造成任务看似完整，实际上没有可执行前提

## Risks / Trade-offs

- [Risk] 这次 PRD 范围较大，容易重新变成“所有安全问题大杂烩”
  → Mitigation：明确分成本地可落地与保留缺口两组，并按阶段拆任务

- [Risk] retention / cleanup 默认值如果设得过短，会损失调试与回放价值
  → Mitigation：要求显式保留策略、可配置阈值和导出入口，而不是一刀切删除

- [Risk] secret scanning / DLP 误报会干扰正常开发
  → Mitigation：区分 block / warn / audit-only 三种动作，并先覆盖高置信规则

- [Risk] MCP provenance 与 allowlist 要求过严，可能降低外部能力接入灵活性
  → Mitigation：允许“显式信任后接入”，但默认不再把所有外部能力视为同等可信

- [Risk] 把系统级 sandbox 等缺口写进 PRD，可能被误解为本轮承诺实现
  → Mitigation：在 proposal、spec 和 tasks 中都标明其为保留缺口，不进入当前实现阶段

## Migration Plan

1. 先补齐 proposal/spec/design，把完整差距显式登记
2. 第一实现阶段只处理本地可落地项：
   - retention / cleanup
   - transcript/session/prompt dump 保护
   - symlink-safe file boundary
   - MCP trust/provenance
   - secret scanning / DLP
3. 第二阶段再根据依赖拆出单独 PRD：
   - 系统级 sandbox
   - 云 telemetry 隐私分层
   - 远端 Team Memory sync 安全模型
4. 若第一阶段任一项引入不可接受的兼容风险，可按 capability 回滚，不影响其他缺口登记

## Open Questions

- prompt dump 的默认行为是“始终脱敏输出”，还是提供受保护的原文导出模式但要求显式确认？
- local data retention 默认是按天数、按条目数，还是二者组合？
- secret scanning / DLP 第一阶段是否只覆盖高置信模式，还是同时提供用户自定义规则入口？
- MCP trust policy 是按 server 维度、tool 维度，还是同时支持两层 allowlist？
- 远端 Team Memory sync 后续应归入现有 `team-communication-protocol`，还是单独新建 capability？

## Governance Baseline

| Family | Retention Class | Default Retention | Export Mode | Delete Mode |
| --- | --- | --- | --- | --- |
| Session persistence | `protected_runtime_state` | 14 days | `protected_export` | `explicit_delete` |
| Transcript snapshot | `protected_snapshot` | 7 days | `protected_export` | `explicit_delete` |
| Prompt dump | `protected_snapshot` | 7 days | `protected_export` | `explicit_delete` |
| Short-term memory | `knowledge_short_term` | 14 days | `query_only` | `explicit_delete` |
| Long-term memory | `knowledge_long_term` | 90 days | `query_only` | `explicit_delete` |
| Observability | `operational_telemetry` | 14 days target | `query_only` | `explicit_delete` |
| Security / audit artifacts | `security_audit` | 30 days target | `protected_export` | `explicit_delete` |

## Reserved Gap Inputs

### System Sandbox

- Platform-specific runtime isolation primitives are intentionally left for a dedicated PRD because they change the execution model, not just one capability surface.
- That follow-up must validate nested shell, interpreter, and network containment rather than only direct command containment.

### Cloud Telemetry

- Remote telemetry is intentionally deferred until privacy tiers, organization-level disable controls, and essential-only payload baselines are specified.
- That follow-up must prove that local observability and remote export can evolve independently.

### Shared Team Memory

- Remote/shared memory is intentionally deferred until principal identity, workspace isolation, encryption boundaries, and delete propagation are modeled explicitly.
- That follow-up must decide whether shared memory extends the team protocol or lands as a separate capability boundary.
