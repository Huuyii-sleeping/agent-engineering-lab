## 1. PRD 与规格

- [x] 1.1 新增 PRD-45，定义 composer 编辑抛光范围与验收
- [x] 1.2 新增 OpenSpec proposal / design / spec / tasks

## 2. Composer 编辑行为

- [x] 2.1 扩展 composer store，支持本地撤回与结构化预览辅助
- [x] 2.2 在 CLI / TUI composer 模式下保留空行输入，不再把空输入直接忽略
- [x] 2.3 新增 `/pop [n]` 命令，支持撤回最近草稿行并输出稳定反馈

## 3. CLI / TUI 产品面

- [x] 3.1 强化 `/preview`、`/help` 与 composer 文案，展示更清晰的草稿结构
- [x] 3.2 TUI 增加 draft panel 和更明确的 footer / controls 提示

## 4. 验证

- [x] 4.1 focused tests 覆盖空行保留、`/pop` 和 TUI draft panel
- [x] 4.2 `pnpm --filter agent-cli build`
- [x] 4.3 `openspec validate prd-45-cli-composer-editing-polish --strict`
- [x] 4.4 `git diff --check`
