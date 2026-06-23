# 任务

## 1. Registry Publish

- [x] 1.1 抽出 registry package 校验逻辑
- [x] 1.2 实现 `RegistryStore.publishPackage`
- [x] 1.3 实现 `POST /admin/publish`
- [x] 1.4 测试发布、列表、下载和下载计数

## 2. BFF 接入

- [x] 2.1 SkillStoreService 支持向 registry service publish package
- [x] 2.2 SkillInstallerService 在配置 registry service 时把 custom upload 发布到 registry
- [x] 2.3 测试 BFF custom upload 转发到 registry service

## 3. 验证交付

- [x] 3.1 执行 `pnpm --filter skill-registry test/build`
- [x] 3.2 执行 `pnpm --filter agent-bff test/build`
- [x] 3.3 执行 `pnpm test`、`pnpm build`
- [x] 3.4 Docker registry service 重建并验证 publish API
- [x] 3.5 完成本地提交
