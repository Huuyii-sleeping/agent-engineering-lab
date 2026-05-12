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

### Requirement: Prompt section generation MUST be testable in isolation
系统 MUST 支持单独验证每个 prompt section 的生成逻辑，并支持验证最终组装顺序与输出边界。

#### Scenario: 单测验证 section 输出
- **WHEN** 测试仅构造某一 section 的输入
- **THEN** 系统可独立生成该 section 的输出并断言其内容或顺序
