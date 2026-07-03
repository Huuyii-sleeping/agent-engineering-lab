# production-skillhub-runtime-binding

## Why

第四阶段已经让 Agent profile 可以保存版本化 Skill 绑定，但仍有三个生产风险：

- BFF 仍信任 Web 传入的绑定，缺少服务端权威校验。
- Web 可以展示绑定版本，但没有提示已卸载、版本缺失或版本漂移。
- Agent 测试 / 对话链路没有携带当前 Agent 的版本化 Skill 绑定，运行时无法知道应使用哪组能力。

本阶段要把这些风险收口到可用状态：BFF 校验绑定，Web 显示失效状态，并把绑定上下文传入 agent service。

## What Changes

- BFF Agent profile 保存时用 SkillHub 安装状态校验 `skills`。
- BFF 拒绝未安装、版本不匹配或来源不匹配的绑定。
- Web Agent 配置页显示绑定健康状态。
- Web 创建 session 和发送消息时带上当前 Agent 上下文。
- BFF 将 Agent 上下文转发给 agent service。
- agent service session 记录新增 Agent 上下文字段，并在 session summary / detail 返回。

## Non-Goals

- 本阶段不实现真正的多版本 Skill 文件加载器。
- 本阶段不做复杂的版本切换 UI。
- 本阶段不做权限弹窗审批。

## Acceptance Criteria

- 保存 Agent 时，BFF 会拒绝未安装 Skill 绑定。
- 保存 Agent 时，BFF 会拒绝版本与当前 installed version 不一致的绑定。
- Agent 配置页能展示绑定正常 / 已卸载 / 版本缺失 / 版本漂移。
- 创建 session 和发送消息时，Web 会带上 active Agent 的版本化绑定。
- agent service 返回的 session summary/detail 包含 agent 上下文。
- BFF / Web / agent service 相关测试通过。
