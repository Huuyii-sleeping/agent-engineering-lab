## Context

外部文档《02-user-data-and-usage》把用户数据面拆成八类：进入模型的工作上下文、本地持久化、memory、analytics/telemetry、账户与身份、team memory 同步、用户主动上传、remote/bridge 扩展边界。当前仓库已经实现了其中一部分本地等价能力，但这些能力分散在 prompt、session、memory、observability、bridge 等多个模块里，用户很难从仓库本身回答“系统到底接触了什么数据，以及为什么接触”。

这次 PRD 的重点不是追加一个新功能按钮，而是建立一层统一治理面，让现有能力具备可解释性，同时把当前仓库尚不存在的产品面显式登记为缺口。这样后续即使继续做 account、remote telemetry、team memory 或主动上传，也必须先挂接到统一治理面，而不是形成新的隐式数据路径。

约束如下：

- 用户要求只总结成一个 PRD，不能再拆多个主题 PRD。
- 当前仓库是本地优先架构，很多外部文档中的产品面并不存在，不能硬写成“已实现”。
- 对于暂时做不了的能力，必须保留缺口，而不是略过不写。

## Goals / Non-Goals

**Goals:**

- 用一个 PRD 覆盖外部文档涉及的全部用户数据面，不遗漏 account/org、remote telemetry、shared memory、主动上传等当前缺失项。
- 为当前已存在的本地能力补齐 disclosure requirement，让“进入模型”“落本地”“启用 bridge/remote 后扩大边界”都可被检查和说明。
- 建立统一状态模型，至少区分 `已实现`、`部分等价`、`待实现`、`保留缺口`。
- 给未来可能引入的远端数据能力设置接入前提：先声明数据边界、再做实现。

**Non-Goals:**

- 在本轮实现完整的用户数据治理 UI、远端控制台或组织管理面。
- 在没有产品面和后端契约的情况下伪造 account/org、team memory sync、transcript share 或训练改进上传实现。
- 在本轮改变现有 local retention、安全审计或 secret scanning 的底层机制；这些已由前序 PRD 处理。

## Decisions

### 1. 用一个新增治理 capability 汇总全部用户数据面，而不是继续把说明散落在各个局部 spec

决策：

- 新增 `user-data-governance-surface` 作为统一入口。
- 该 capability 只负责数据面清单、状态标记、默认启用状态、导出/删除/保留语义、以及保留缺口登记。
- 现有能力继续维护各自行为 requirement，但要把自己的数据合同挂接到统一治理面。

原因：

- 外部文档关注的是“用户视角”，而不是模块视角。
- 如果继续把说明散落在 session、memory、observability 等 spec 中，用户仍然无法得到一份完整答案。

备选方案：

- 只修改现有 spec，不新增统一 capability。
- 不采用原因：会继续形成“实现存在，但数据边界没有一处能看全”的问题。

### 2. 把“进入模型的内容”视为一级治理对象，而不只是 prompt inspect 的调试细节

决策：

- 在 `system-prompt-pipeline` 增加 requirement，要求显式列出会进入模型请求的上下文类型及其 inclusion reason。
- 默认 inspection 只展示类型、来源和是否激活，不直接暴露完整上下文正文。

原因：

- 外部文档强调最敏感的数据通常不是 analytics，而是源码、命令输出、历史对话、memory、attachments、MCP 返回等模型上下文。
- 当前 prompt inspect 更偏向开发调试，不足以回答“模型到底看到了什么”。

备选方案：

- 保持现有 prompt dump 语义，仅依赖 protected export。
- 不采用原因：只能导出 prompt，不能清楚解释各类上下文的来源和用途。

### 3. 对当前仓库不存在的产品面采用“保留缺口”而不是“弱等价映射”

决策：

- account / org / OAuth 身份数据面、shared team memory sync、用户主动上传、remote telemetry 分层一律登记为 `保留缺口`。
- 统一治理面必须能把这些能力标记为 `unsupported` 或 `reserved_gap`，并给出原因。

原因：

- 当前仓库没有完整账号体系、训练改进上传或组织级 memory sync。
- 把本地 team 协作协议、local observability 或 bridge 事件硬映射成这些产品面，会制造错误结论。

备选方案：

- 用当前的 team protocol、bridge state 或 observability 近似代表 account、team memory、analytics。
- 不采用原因：这会掩盖真正没做的部分，违背用户“要完整”的要求。

### 4. 将 telemetry 分成“本地 observability”和“远端 analytics/export”两个层次

决策：

- `observability-replay-debug` 只声明当前本地事件、指标、replay 面。
- 统一治理面负责声明当前仓库是否存在 remote sink、若不存在则必须显式显示为未启用或未实现。
- 后续若新增 remote analytics，必须单独补 essential-only、组织级关闭、身份字段、payload ceiling 等 requirement。

原因：

- 当前仓库的 `.observability` 是本地可观测性，不等于 Datadog/remote analytics。
- 如果不分层，用户无法判断哪些数据只是本地调试，哪些会实际出站。

备选方案：

- 在 observability spec 里直接预埋完整 remote analytics 需求。
- 不采用原因：当前没有对应产品面，强行写入会让 spec 假装已有后端能力。

### 5. 将 shared team memory、transcript share、训练改进上传视为 consent-bound egress，而不是普通本地特性

决策：

- 这些能力本轮只进入治理面和任务登记，不进入实现范围。
- 统一治理面必须把它们与本地 memory、local transcript、bridge ingress 明确区分。

原因：

- 它们本质上都涉及用户主动或组织策略驱动的出站行为。
- 这类能力必须先定义 consent、脱敏、tenant 边界和删除传播，不应和本地功能混在一起。

备选方案：

- 只在 proposal 里一笔带过，不进入治理 contract。
- 不采用原因：后续最容易再次遗漏的恰好就是这些“当前没实现”的出站数据面。

## Risks / Trade-offs

- [Risk] 这个 PRD 会显得比单一功能 PRD 更宽。 -> Mitigation：范围只到“治理 contract 与缺口登记”，不把所有产品面都拉进实现范围。
- [Risk] 把未实现能力写进同一个 PRD，可能被误解为本轮承诺交付。 -> Mitigation：在 proposal、spec、tasks 中统一使用 `保留缺口` / `reserved_gap` 语义，并单列 out-of-scope。
- [Risk] 统一治理面如果过度细化，会与现有实现耦合太深。 -> Mitigation：先约束数据类别、状态与边界，不绑定某一个具体 UI 或命令名。
- [Risk] 用户可能希望“完整”意味着立即实现 account / telemetry / shared memory。 -> Mitigation：明确这次交付的是完整 PRD，而不是伪造这些产品面。

## Migration Plan

1. 先建立 `user-data-governance-surface` spec，并把外部文档的 8 类数据面映射到当前仓库状态。
2. 再为 prompt、session、memory、observability、bridge 追加 disclosure requirement，让现有能力能够挂接到治理面。
3. 最后把 account/org、remote telemetry、shared memory、主动上传四类缺口登记为后续输入，避免后续重复开 PRD。
4. 后续实现阶段按“本地可落地 disclosure”优先，再决定是否单独立项处理远端或账号体系。

## Open Questions

- 统一治理面最终以 CLI 命令、静态清单文件、还是 service manifest 的形式暴露更合适？
- `reserved_gap` 是否需要进一步细分为 `not_supported`、`planned`、`blocked_by_product` 三类？
- 如果未来引入 remote analytics，是否要把 identity/account 字段从同一治理 capability 拆成独立 capability？
- shared team memory 后续应挂到 `team-communication-protocol` 还是独立成新的 sync capability？
