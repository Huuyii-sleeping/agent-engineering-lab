# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-runtime-loader` proposal/design/tasks/spec

## 2. SkillHub 绑定解析

- [x] 2.1 新增 SkillHub root 配置解析，支持 `AGENT_SKILLHUB_ROOTS`
- [x] 2.2 loader 支持按 `skillId + version + sourceType` 查找 package
- [x] 2.3 loader 返回结构化绑定加载错误
- [x] 2.4 补 loader 单元测试

## 3. Agent service prompt 注入

- [x] 3.1 chat 执行前基于 session agent context 解析绑定 Skill
- [x] 3.2 成功时用绑定 Skill 替换本轮 `promptSource.skills`
- [x] 3.3 失败时返回 `AGENT_SKILL_LOAD_FAILED` 且不进入 query runtime
- [x] 3.4 补 agent service 单元测试

## 4. 验证

- [x] 4.1 执行 agent-cli loader / service 测试
- [x] 4.2 执行 agent-cli build
- [x] 4.3 执行根级 `pnpm build`
- [x] 4.4 尝试 OpenSpec status / validate 并记录结果
- [x] 4.5 清理运行产物
