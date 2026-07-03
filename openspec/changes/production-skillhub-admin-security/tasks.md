# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-admin-security` proposal/design/tasks/spec

## 2. Registry Admin Security

- [x] 2.1 增加 registry admin token 配置
- [x] 2.2 `/admin/**` 统一校验 bearer token
- [x] 2.3 增加 publisher list/create API
- [x] 2.4 增加 audit event 表、写入和查询 API

## 3. BFF 接入

- [x] 3.1 增加 BFF registry admin token 配置
- [x] 3.2 BFF publish custom package 时带 bearer token
- [x] 3.3 保持 public registry read/download 无 token 可用

## 4. 测试

- [x] 4.1 补 registry admin 鉴权测试
- [x] 4.2 补 publisher/audit API 测试
- [x] 4.3 补 BFF publish token 转发测试

## 5. 验证

- [x] 5.1 执行 `pnpm --filter skill-registry test/build` 等价验证
- [x] 5.2 执行 `pnpm --filter agent-bff test/build` 等价验证
- [x] 5.3 执行 `pnpm build`
- [x] 5.4 清理本阶段产生的运行产物
