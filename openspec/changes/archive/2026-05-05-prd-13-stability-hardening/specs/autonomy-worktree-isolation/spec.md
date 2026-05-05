## ADDED Requirements

### Requirement: Autonomy and worktree runtime SHALL use configurable operational constants
自治轮询与 worktree 相关运行参数 MUST 通过统一配置入口读取，并保持与既有行为兼容。

#### Scenario: 自治参数默认值可用
- **WHEN** 未设置自治相关环境变量
- **THEN** 系统使用默认轮询间隔与空闲超时，行为稳定

#### Scenario: 自治参数可配置
- **WHEN** 设置自治相关环境变量
- **THEN** 新参数立即生效，无需修改源码
