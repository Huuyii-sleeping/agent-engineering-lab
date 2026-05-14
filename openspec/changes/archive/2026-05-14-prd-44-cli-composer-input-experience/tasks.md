## 1. PRD 与规格

- [x] 1.1 新增 PRD-44，定义 CLI 多行 composer 范围与验收
- [x] 1.2 新增 OpenSpec proposal / design / spec / tasks

## 2. Composer 状态层

- [x] 2.1 新增共享 composer store，按 session 维护 draft
- [x] 2.2 支持开始、追加、预览、发送、取消

## 3. Slash Commands

- [x] 3.1 新增 `/compose`、`/preview`、`/send`、`/cancel`
- [x] 3.2 composer 模式下普通输入追加到 draft，不直接请求模型
- [x] 3.3 草稿模式中不触发审批快捷词等隐式动作

## 4. CLI / TUI 体验

- [x] 4.1 更新 prompt / footer / help，显示 draft 状态
- [x] 4.2 更新 TUI 控制面文案与 activity 呈现

## 5. 验证

- [x] 5.1 focused tests 覆盖 composer 命令与输入流转
- [x] 5.2 `pnpm --filter agent-cli build`
- [x] 5.3 `openspec validate prd-44-cli-composer-input-experience --strict`
- [x] 5.4 `git diff --check`
