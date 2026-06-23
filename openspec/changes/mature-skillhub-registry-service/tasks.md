# 任务

## 1. Registry Service

- [x] 1.1 新增 `apps/skill-registry` workspace package
- [x] 1.2 实现 SQLite store、schema 初始化和默认 registry seed
- [x] 1.3 实现 `/health`、`/skills`、`/skills/:id`、`/skills/:id/versions`、`POST /skills/:id/download`
- [x] 1.4 增加单元测试覆盖 seed、list、download 计数和 package 返回

## 2. Docker

- [x] 2.1 新增 `apps/skill-registry/Dockerfile`
- [x] 2.2 新增 compose 配置，挂载 `runtime/skill-registry:/data`
- [x] 2.3 增加 root scripts 方便启动 registry service

## 3. BFF 接入

- [x] 3.1 新增 `SKILL_REGISTRY_SERVICE_URL` 配置
- [x] 3.2 BFF remote registry 读取优先走 registry service
- [x] 3.3 BFF 下载 registry service package 时使用 POST 并保持 hash 校验
- [x] 3.4 补 BFF 单元测试覆盖 registry service provider

## 4. 验证与交付

- [x] 4.1 执行 `pnpm --filter skill-registry test/build`
- [x] 4.2 执行 `pnpm --filter agent-bff test/build`
- [x] 4.3 执行 `pnpm test`、`pnpm build`
- [x] 4.4 启动服务并验证 `/api/skills` 可从 registry service 返回 skill
- [x] 4.5 完成本地提交
