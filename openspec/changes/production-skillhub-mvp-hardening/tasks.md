# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-mvp-hardening` proposal/design/tasks/spec

## 2. BFF

- [x] 2.1 增加生命周期操作互斥锁和 busy 错误
- [x] 2.2 新增 SkillHub readiness 类型、service 和 controller API
- [x] 2.3 为本地 package 计算并返回 SHA-256 hash
- [x] 2.4 补 BFF 测试

## 3. Web

- [x] 3.1 增加 readiness API 类型和读取函数
- [x] 3.2 App 刷新 SkillHub 时读取服务端 readiness
- [x] 3.3 SkillHubPage 优先展示服务端 readiness
- [x] 3.4 补 Web 测试

## 4. 验证

- [x] 4.1 执行 SkillHub 页面测试
- [x] 4.2 执行 BFF 单元测试
- [x] 4.3 执行 Web 全量测试
- [x] 4.4 执行根级 `pnpm build`
- [x] 4.5 尝试 OpenSpec status / validate 并记录结果
- [x] 4.6 清理运行产物
