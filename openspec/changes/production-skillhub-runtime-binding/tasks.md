# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-runtime-binding` proposal/design/tasks/spec

## 2. BFF 权威校验

- [x] 2.1 `AgentProfileService` 注入 SkillHub 安装状态
- [x] 2.2 保存 Agent 时补齐旧 payload 的版本化绑定
- [x] 2.3 拒绝未安装、版本不一致或来源不一致的绑定
- [x] 2.4 Controller 返回结构化校验错误
- [x] 2.5 补 BFF 测试

## 3. Web 绑定状态与运行上下文

- [x] 3.1 API client 增加 Agent runtime context
- [x] 3.2 创建 session / 发送消息携带 active Agent
- [x] 3.3 Agent 配置页展示绑定健康状态
- [x] 3.4 补 Web API / 页面测试

## 4. Agent service 接收上下文

- [x] 4.1 Session 模型新增 agent 上下文
- [x] 4.2 `/sessions` 和 `/chat` 接收并持久化 agent 上下文
- [x] 4.3 summary/detail 返回 agent 上下文
- [x] 4.4 补 agent service 测试

## 5. 验证

- [x] 5.1 执行 BFF 测试
- [x] 5.2 执行 Web 测试
- [x] 5.3 执行 agent-cli session 测试
- [ ] 5.4 执行根级 `pnpm build`
- [ ] 5.5 尝试 OpenSpec status / validate 并记录结果
- [ ] 5.6 清理运行产物
