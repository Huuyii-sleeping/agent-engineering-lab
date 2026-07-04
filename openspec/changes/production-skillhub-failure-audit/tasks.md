# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-failure-audit` proposal/design/tasks/spec

## 2. BFF 失败审计

- [x] 2.1 扩展 Skill audit event 字段
- [x] 2.2 增加失败审计写入方法
- [x] 2.3 controller 在明确 Skill id 的失败响应前写入事件
- [x] 2.4 补 BFF 测试

## 3. Web 展示

- [x] 3.1 API client 归一化失败审计字段
- [x] 3.2 Skill 详情审计日志展示失败原因
- [x] 3.3 补 Web API / 页面测试

## 4. 验证

- [x] 4.1 执行 BFF 相关测试
- [x] 4.2 执行 Web 测试
- [x] 4.3 执行根级 `pnpm build`
- [x] 4.4 尝试 OpenSpec status / validate 并记录结果
- [x] 4.5 清理运行产物
