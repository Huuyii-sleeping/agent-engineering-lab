# production-skillhub-failure-audit

## Why

SkillHub 已经记录成功 lifecycle 操作，但排障时同样需要知道哪些操作失败过。下载不存在、升级不可用、回滚不可用等失败如果只在当次请求里返回错误，用户刷新后就失去线索。

本阶段把有明确 `skillId` 的失败操作写入审计日志，并在 Web 详情面板中显示失败原因。

## What Changes

- Skill audit event 增加 `ok`、`code`、`message` 字段。
- BFF 在有明确 Skill id 的 lifecycle 失败时写入失败审计事件。
- Web API client 归一化失败字段。
- Skill 详情面板区分成功/失败事件，并显示失败原因。

## Non-Goals

- 不记录无可信 Skill id 的无效上传包。
- 不实现用户身份字段。
- 不改变原有错误响应状态码。
- 不做审计分页。

## Acceptance Criteria

- 失败的下载、安装、升级、回滚、卸载会写入 `ok: false` 审计事件。
- Web 审计日志展示失败状态和错误原因。
- 既有成功审计事件保持兼容。
