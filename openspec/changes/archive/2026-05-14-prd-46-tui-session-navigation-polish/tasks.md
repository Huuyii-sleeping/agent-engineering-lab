## 1. PRD 与规格

- [x] 1.1 新增 PRD-46，定义 TUI 会话导航与切换范围
- [x] 1.2 新增 OpenSpec proposal / design / spec / tasks

## 2. Session 导航命令

- [x] 2.1 强化 `/use`，支持 index / unique prefix / latest
- [x] 2.2 新增 `/next` 与 `/prev`，支持循环切换 session

## 3. TUI / CLI 交互面

- [x] 3.1 优化 `/sessions` 输出，补充序号与 active 状态
- [x] 3.2 更新 TUI Sessions panel、controls、banner、footer 的导航提示

## 4. 验证

- [x] 4.1 focused tests 覆盖 `/use` selector、`/next`、`/prev` 与 TUI sessions panel
- [x] 4.2 `pnpm --filter agent-cli test -- cli-ui.test.ts cli-commands.test.ts entrypoints/tui.test.ts`
- [x] 4.3 `pnpm --filter agent-cli build`
- [x] 4.4 `openspec validate prd-46-tui-session-navigation-polish --strict`
- [x] 4.5 `git diff --check`
