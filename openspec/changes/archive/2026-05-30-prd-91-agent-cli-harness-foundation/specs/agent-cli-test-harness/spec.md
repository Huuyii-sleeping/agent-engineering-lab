## ADDED Requirements

### Requirement: Harness MUST provide isolated workspace fixtures
Agent CLI 测试 harness MUST 提供隔离 workspace fixture，用于创建临时目录、写入初始文件、切换 `cwd`、设置环境变量，并在结束后恢复进程状态和清理临时目录。

#### Scenario: 场景执行后恢复进程状态
- **WHEN** 测试通过 harness 在临时 workspace 中执行场景
- **THEN** harness 在结束后恢复原始 `cwd` 与环境变量

### Requirement: Harness MUST provide deterministic model scripts
Agent CLI 测试 harness MUST 提供确定性模型脚本能力，使测试可以按序模拟 assistant 文本、tool call 响应和模型错误，而不依赖真实模型服务。

#### Scenario: 模型脚本按序消费
- **WHEN** 场景连续请求 deterministic model
- **THEN** harness 按脚本顺序返回响应，并记录每次请求

#### Scenario: 模型脚本耗尽
- **WHEN** 测试请求超过脚本中定义的响应数量
- **THEN** harness 返回明确错误，指出 deterministic model script exhausted

### Requirement: Harness MUST run structured local scenarios
Agent CLI 测试 harness MUST 支持结构化本地场景 runner，用统一步骤表达文件准备、动作执行、模型调用、故障注入和断言结果。

#### Scenario: 结构化场景执行成功
- **WHEN** 场景包含文件断言、输出断言和模型调用断言
- **THEN** harness 返回 passed 结果和每个步骤的可读记录

#### Scenario: 结构化场景执行失败
- **WHEN** 场景中的断言失败或动作抛错
- **THEN** harness 返回 failed 结果、失败步骤名称和失败原因
