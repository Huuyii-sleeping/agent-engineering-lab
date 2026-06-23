# publish-to-skill-registry

## 背景

`apps/skill-registry` 已经可以通过 Docker 启动、使用 SQLite 和挂载目录持久化 seed skill。但它目前只能从静态 registry seed 导入，不能接收新 Skill 发布。生产级 SkillHub 需要让可信的上传/发布流程进入 registry service，而不是只保存在 BFF 本地 `.data`。

## 目标

- 为 `apps/skill-registry` 新增受控 publish API。
- publish payload 继续沿用当前安全边界：只接受 JSON package，必须包含 `SKILL.md` 和 `skill.json`。
- registry service 在发布时计算 `packageSha256`、写入 SQLite、写入 `/data/packages`。
- BFF 在配置 `SKILL_REGISTRY_SERVICE_URL` 时，将 custom upload 转发到 registry service 发布，并刷新本地可见 registry。
- 保留未配置 registry service 时的本地 custom upload fallback。

## 非目标

- 不实现登录、发布者权限模型、审核后台。
- 不实现签名验签。
- 不升级 package 格式到 zip/tar。
- 不引入外部对象存储。

## 验收标准

- `POST /admin/publish` 可发布一个合法 skill package 并返回 registry entry。
- 发布后 `GET /skills` 能看到新 skill。
- `POST /skills/:id/download` 能下载发布后的 package，并增加下载计数。
- BFF `/api/skills/upload` 在配置 registry service 时能发布到 registry service。
- 全量测试和构建通过。
