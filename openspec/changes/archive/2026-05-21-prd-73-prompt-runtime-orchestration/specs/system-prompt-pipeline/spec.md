## ADDED Requirements

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

