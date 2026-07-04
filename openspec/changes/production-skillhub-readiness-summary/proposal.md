# production-skillhub-readiness-summary

## Why

SkillHub 已经具备安装、升级、回滚、影响确认和审计日志，但用户进入页面后仍需要逐项查看才能判断整体健康状态。生产级控制台应该在首屏给出“是否需要关注”的摘要。

本阶段增加 SkillHub 健康/就绪摘要，把 registry 同步、安装数量、可升级数量和失败审计数量聚合到页面顶部。

## What Changes

- App 保存最近一次 registry 同步状态。
- SkillHubPage 接收 registry 状态并计算健康摘要。
- 页面顶部展示同步状态、已安装数量、可升级数量、失败事件数量。
- 测试覆盖摘要文本。

## Non-Goals

- 不新增 BFF 健康 API。
- 不阻止任何操作。
- 不做复杂告警规则或通知。

## Acceptance Criteria

- SkillHub 顶部展示健康/就绪摘要。
- 有 registry 同步错误时显示需要关注。
- 可升级 Skill 和失败审计事件数量可见。
- 无 registry 状态时显示等待同步。
