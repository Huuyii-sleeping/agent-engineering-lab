# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-package-v1` proposal/design/tasks/spec

## 2. Package v1 类型与校验

- [x] 2.1 在 BFF 与 registry 类型中补充 `skillPackageVersion`
- [x] 2.2 BFF validator 支持 legacy 与 `skillPackageVersion: "1.0"` 包
- [x] 2.3 registry validator 支持 legacy 与 `skillPackageVersion: "1.0"` 包
- [x] 2.4 校验重复路径、未知 package version、无效 `permissions.json`

## 3. 测试

- [x] 3.1 补 registry service 单元测试覆盖 package v1 publish
- [x] 3.2 补 BFF 单元测试覆盖 package v1 upload
- [x] 3.3 确认 legacy package 测试仍通过

## 4. 验证

- [x] 4.1 执行 `pnpm --filter skill-registry test/build` 等价验证
- [x] 4.2 执行 `pnpm --filter agent-bff test/build` 等价验证
- [x] 4.3 清理本阶段产生的运行产物
