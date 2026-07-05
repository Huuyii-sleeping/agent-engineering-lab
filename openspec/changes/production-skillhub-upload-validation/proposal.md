# production-skillhub-upload-validation

## Why

SkillHub 支持上传私有 Skill package，但当前前端只校验 JSON 是否可解析。用户缺少 `files`、`SKILL.md`、`skill.json` 或文件内容为空时，需要等到请求发到后端才知道失败原因。

生产级上传入口应该在本地先给出明确、可操作的错误，减少无意义请求和排查成本。

## What Changes

- 增加 Skill package 前端结构校验。
- 上传前检查 `files` 数组、文件路径、文件内容、`SKILL.md` 和 `skill.json`。
- 校验失败时在上传表单内显示错误，不调用上传回调。
- 测试覆盖有效 package 和常见错误 package。

## Non-Goals

- 不替代后端安全校验。
- 不解析 `SKILL.md` frontmatter。
- 不校验 `skill.json` 业务字段完整性。

## Acceptance Criteria

- 非对象 JSON 显示明确错误。
- 缺少 `files` 或 `files` 为空时显示明确错误。
- 缺少 `SKILL.md` 或 `skill.json` 时显示明确错误。
- 文件路径或内容非法时显示明确错误。
- 有效 package 仍可上传。
