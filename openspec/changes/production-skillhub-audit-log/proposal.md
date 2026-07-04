# production-skillhub-audit-log

## Why

SkillHub 已经支持安装、升级、卸载、回滚和影响确认，但这些操作完成后缺少可追踪记录。生产级能力中心需要回答“谁在什么时候改了哪个 Skill 的状态”，至少要先具备本地审计事件视图，便于排障和回溯。

本阶段新增 SkillHub lifecycle 审计日志，先记录 BFF 成功执行的关键 Skill 操作，并在 Web 详情面板展示当前 Skill 的最近事件。

## What Changes

- BFF Skill store 状态新增 `auditEvents`。
- BFF 成功下载、安装、升级、回滚、卸载、上传后写入审计事件。
- BFF 新增 `GET /api/skills/audit`。
- Web API client 新增 `fetchSkillAuditEvents()`。
- Skill 详情面板展示当前 Skill 最近审计事件。

## Non-Goals

- 不实现用户身份鉴别或多租户审计。
- 不记录失败事件。
- 不做远端审计上传。
- 不实现分页查询。

## Acceptance Criteria

- 成功 Skill lifecycle 操作会写入审计事件。
- Web 可读取审计事件。
- Skill 详情面板显示当前 Skill 的最近审计事件。
- 没有事件时显示空状态。
