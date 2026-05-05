## ADDED Requirements

### Requirement: Agent loop SHALL support centralized runtime configuration
主循环及其核心工具 MUST 通过统一配置入口读取关键运行参数（如超时、阈值、输出截断），并支持环境变量覆盖默认值。

#### Scenario: 默认配置生效
- **WHEN** 未设置相关环境变量
- **THEN** 系统使用内置默认配置并可正常运行

#### Scenario: 环境变量覆盖配置
- **WHEN** 设置有效的配置环境变量
- **THEN** 对应运行参数在不改代码情况下生效
