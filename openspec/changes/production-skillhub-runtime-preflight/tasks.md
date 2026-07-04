# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-runtime-preflight` proposal/design/tasks/spec

## 2. Agent service

- [x] 2.1 新增 Agent Skill 绑定预检 service 方法
- [x] 2.2 新增 `POST /skills/resolve`
- [x] 2.3 预检失败复用 `AGENT_SKILL_LOAD_FAILED`
- [x] 2.4 补 agent service 单元测试

## 3. BFF proxy

- [x] 3.1 AgentProxyService 增加预检代理
- [x] 3.2 BFF 新增 `POST /api/agent-skills/resolve`
- [x] 3.3 补 BFF 单元测试

## 4. 验证

- [x] 4.1 执行 agent-cli service 测试
- [x] 4.2 执行 BFF server 测试
- [x] 4.3 执行 agent-cli / BFF build
- [x] 4.4 执行根级 `pnpm build`
- [x] 4.5 尝试 OpenSpec status / validate 并记录结果
- [x] 4.6 清理运行产物
