# 任务

## 1. OpenSpec

- [x] 1.1 创建 `production-skillhub-audit-log` proposal/design/tasks/spec

## 2. BFF 审计

- [x] 2.1 增加 Skill audit 类型和状态字段
- [x] 2.2 成功 lifecycle 操作后写入 audit event
- [x] 2.3 新增 `GET /api/skills/audit`
- [x] 2.4 补 BFF 测试

## 3. Web 展示

- [x] 3.1 API client 增加 audit 类型和读取函数
- [x] 3.2 App 加载和操作后刷新审计事件
- [x] 3.3 Skill 详情面板展示最近审计事件
- [x] 3.4 补 Web API / 页面测试

## 4. 验证

- [x] 4.1 执行 BFF 相关测试
- [x] 4.2 执行 Web 测试
- [x] 4.3 执行根级 `pnpm build`
- [x] 4.4 尝试 OpenSpec status / validate 并记录结果
- [x] 4.5 清理运行产物
