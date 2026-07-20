## MODIFIED Requirements

### Requirement: Web Console MUST provide an SOP Builder with a DAG canvas
Web Console MUST provide an SOP Builder view (replacing the former Agent Builder config-assembly interaction) that lets users author Standard Operating Procedures as a Directed Acyclic Graph: a list of SOPs plus a canvas editor built on React Flow for dragging nodes, connecting edges, configuring node parameters and edge conditions, and validating the DAG.

#### Scenario: User opens SOP Builder
- **WHEN** 用户打开 Web Console 并进入 SOP Builder tab
- **THEN** 页面优先展示已创建的 SOP 列表（卡片网格）
- **AND** 顶部工具条提供筛选（全部 / 草稿 / 已发布）与右上角「新建流程」入口

#### Scenario: User creates a new SOP flow
- **WHEN** 用户点击「新建流程」
- **THEN** 进入画布编辑器，画布为空并提示从节点库拖入「开始」节点
- **AND** 左侧节点库提供开始 / 结束 / 处理 / AI 调用 / 条件判断 / 人工审批六类节点可拖拽

#### Scenario: User edits a flow on the canvas
- **WHEN** 用户从节点库拖入节点、拖动节点、并用 handle 连线到另一节点
- **THEN** 画布以 SVG 贝塞尔连线呈现执行流
- **AND** 点击节点在右侧配置面板编辑名称、类型相关参数（如 AI 节点的 model）与条件节点的出边条件

#### Scenario: User validates the DAG
- **WHEN** 用户点击「校验流程」
- **THEN** 系统检查：恰有一个起点、从起点可达、无悬挂节点、无环
- **AND** 结果以通过（绿）或警告（琥珀，列出问题）呈现

#### Scenario: User saves a draft SOP
- **WHEN** 用户在画布中点击「保存草稿」
- **THEN** 当前 SOP（nodes / edges / 名称 / 状态）写入本地草稿 store
- **AND** 返回列表后该 SOP 出现在对应筛选分组中

#### Scenario: User references an SOP from an agent draft
- **WHEN** 用户在 Agent 草稿中配置可使用的 SOP
- **THEN** SOP Builder 中已创建的 SOP 可作为可引用项出现（v1 仅预留数据/视觉入口，不实现执行注入）
