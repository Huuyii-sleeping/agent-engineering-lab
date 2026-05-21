# system-prompt-pipeline Specification

## Purpose
定义统一的 system prompt 组装流水线，明确稳定规则、动态上下文、运行时通知、记忆注入与来源归属之间的拼装边界和测试契约。
## Requirements
### Requirement: System prompt SHALL be assembled by a centralized pipeline
系统 SHALL 通过统一的 system prompt 组装流水线生成模型请求所需的主 system prompt 与补充 system messages，而不是在主循环和配置文件中分散拼接。

#### Scenario: 统一组装主 prompt 与补充消息
- **WHEN** Agent 在一轮模型请求前准备 system 输入
- **THEN** 系统通过统一 builder 生成主 `system prompt` 与补充 `system messages`

### Requirement: Stable and dynamic prompt sources MUST be separated
系统 MUST 将稳定规则来源与动态上下文来源显式分离。稳定规则适合进入主 `system prompt`，动态提醒、通知和运行时注入内容 MUST 保持为补充 system messages 或等效独立 section。

#### Scenario: 动态通知不混入稳定规则
- **WHEN** 存在 background、team、subagent 或其他运行时通知
- **THEN** 这些内容以动态 section 或补充 system message 进入模型输入，而不是直接写回稳定规则字符串

### Requirement: Prompt sections SHALL have explicit source ownership
每个 prompt section SHALL 具有单一来源与单一职责，至少覆盖 `core`、`tools`、`skills`、`memory`、长期规则和动态上下文这些类别中的适用部分。

#### Scenario: 新增来源时不重写整条流水线
- **WHEN** 系统新增一种 prompt 来源
- **THEN** 开发者只需新增或注册对应 section provider，而不需要重写整条组装逻辑

### Requirement: System prompt pipeline SHALL support configured skill selection and local inspection
系统 SHALL 支持从本地 skill catalog 中选择稳定 skills 注入主 `system prompt`，并允许用户通过本地 inspection surface 导出当前 prompt 结果，而不是只能在真实 query 时被动观察。

#### Scenario: Selected skills enter the stable prompt
- **WHEN** 用户通过 `AGENT_SKILLS` 选择一个或多个已发现的 skills
- **THEN** 系统将这些 skills 作为稳定 `skills` section 注入主 `system prompt`
- **AND** 未选中的 skills 不会默认进入主 prompt

#### Scenario: User dumps the current stable prompt locally
- **WHEN** 用户运行 `/prompt` 或 `agent-cli dump-system-prompt`
- **THEN** 系统输出当前稳定 `system prompt` 与 section 信息
- **AND** 不进入模型请求链路

### Requirement: Prompt section generation MUST be testable in isolation
系统 MUST 支持单独验证每个 prompt section 的生成逻辑，并支持验证最终组装顺序与输出边界。

#### Scenario: 单测验证 section 输出
- **WHEN** 测试仅构造某一 section 的输入
- **THEN** 系统可独立生成该 section 的输出并断言其内容或顺序

### Requirement: Prompt inspection surfaces MUST support protected export modes
`/prompt` 与等效 system prompt inspection surface MUST 区分默认 inspection 与受保护导出模式；默认模式 MUST 最小暴露敏感动态上下文，避免完整 system prompt 与补充 system messages 被无门槛长期扩散。

#### Scenario: User dumps the current prompt in default mode
- **WHEN** 用户执行普通 prompt dump / inspection
- **THEN** 系统输出经过最小暴露处理的 prompt 内容或结构摘要
- **AND** 不直接暴露需要受保护的敏感动态上下文

#### Scenario: User requests protected prompt export
- **WHEN** 用户显式请求完整 prompt 导出
- **THEN** 系统要求进入受保护导出路径
- **AND** 该导出结果接入 retention / cleanup 约束

### Requirement: Prompt inspection surfaces MUST disclose model-input categories and inclusion reasons
任何 prompt inspection 或等价治理 surface MUST 能解释当前模型请求可能接触到的上下文类别及其 inclusion reason，至少覆盖用户输入、历史对话、工具结果、memory 注入、compact 摘要、附件、MCP 返回内容与动态运行时提醒。

#### Scenario: User inspects model-input categories
- **WHEN** 用户检查当前模型输入的数据类别
- **THEN** 系统列出各类别是否参与本轮模型请求
- **AND** 说明每一类进入模型的原因，而不要求用户直接阅读完整 prompt 正文

#### Scenario: Default inspection avoids raw context leakage
- **WHEN** 用户以默认模式检查模型输入治理信息
- **THEN** 系统优先展示类别、来源与状态摘要
- **AND** 不因为解释数据来源而直接暴露完整源码片段、完整 transcript 或其他高敏感正文

### Requirement: Prompt inspection MUST disclose categories suppressed by privacy posture
当隐私规避控制导致某些模型输入类别被抑制时，prompt inspection 或等价治理 surface MUST 显式披露这些类别当前未参与模型请求，而不是让它们只是静默消失。

#### Scenario: Memory injection is suppressed by privacy posture
- **WHEN** 用户启用了关闭 auto memory injection 的隐私姿态
- **THEN** prompt inspection 明确标记 `memory_context` 当前被抑制
- **AND** 说明未进入当前模型请求的原因是隐私控制而非无命中

#### Scenario: External or remote-derived context is suppressed
- **WHEN** 用户启用了 local-only 或 external-capabilities disabled 等隐私姿态
- **THEN** prompt inspection 明确标记相关外部上下文类别未参与本轮模型请求
- **AND** 不要求用户通过比对原始 prompt dump 自行推断

### Requirement: Prompt sections SHALL expose runtime governance metadata

系统 SHALL 为每个 prompt section 暴露运行时治理元数据，至少包含 section 类型、来源、缓存策略、优先级、进入模型输入的原因和估算 token 数。

#### Scenario: Builder returns metadata for each section

- **WHEN** 系统构建 prompt envelope
- **THEN** 每个 stable 和 dynamic section 都包含治理元数据
- **AND** metadata 不依赖调用方手工拼接正文推断

### Requirement: Prompt builder SHALL compose override, append, user context and runtime reminders deterministically

系统 SHALL 以确定性顺序合成 prompt 输入：稳定核心规则优先，显式 override 替换核心规则，append 规则追加到稳定规则之后，用户上下文和运行时提醒保持为动态 supplemental system messages。

#### Scenario: Override and append prompt sources are present

- **WHEN** 调用方同时提供 core prompt、override prompt 和 append prompt
- **THEN** override prompt 替换 core prompt
- **AND** append prompt 作为独立稳定 section 出现在 override 之后

#### Scenario: User context and runtime reminders are present

- **WHEN** 调用方提供用户上下文和运行时提醒
- **THEN** 它们作为动态 supplemental system messages 进入模型请求
- **AND** 它们不被写入稳定主 system prompt

### Requirement: Specialized prompt sections SHALL be constructed through shared helpers

memory context、compact summary 和 runtime reminder 等专项 prompt SHALL 通过共享 prompt helper 构造，避免在业务层散落拼接无法审计的 system message 字符串。

#### Scenario: Compact summary enters the prompt envelope

- **WHEN** 调用方提供 compact summary
- **THEN** prompt builder 生成类型为 `compact_summary` 的动态 section
- **AND** inspection 能说明该 section 来自上下文压缩恢复路径

### Requirement: Prompt inspection SHALL show section governance without exposing protected bodies by default

prompt inspection SHALL 在默认模式展示 section id、类型、来源、缓存策略、优先级、估算 token 和 inclusion reason，并避免直接暴露受保护动态正文。

#### Scenario: User inspects prompt governance

- **WHEN** 用户执行 `/prompt` 或等价 dump
- **THEN** 输出包含 stable 与 dynamic section 的治理信息
- **AND** 默认模式不直接泄露 memory、compact summary 或 runtime reminder 的完整正文

