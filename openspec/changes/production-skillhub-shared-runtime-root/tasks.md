# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-shared-runtime-root` proposal/design/tasks/spec

## 2. BFF 共享 root

- [x] 2.1 新增 `resolveSkillHubDataRoot`
- [x] 2.2 BFF main 将 `skillDataRoot` 传入 app module
- [x] 2.3 补 BFF config 单元测试

## 3. Agent runtime fallback

- [x] 3.1 Agent loader 支持 `SKILLHUB_DATA_ROOT` fallback
- [x] 3.2 保持 `AGENT_SKILLHUB_ROOTS` 优先级
- [x] 3.3 补 agent-cli loader 单元测试

## 4. 验证

- [x] 4.1 执行 BFF config 测试
- [x] 4.2 执行 agent-cli loader 测试
- [x] 4.3 执行 BFF / agent-cli build
- [x] 4.4 执行根级 `pnpm build`
- [x] 4.5 尝试 OpenSpec status / validate 并记录结果
- [x] 4.6 清理运行产物
