## 1. Skill Loader 与 Prompt Inspect

- [x] 1.1 新增 `PRD-56`、proposal、design、delta specs 和主规格同步，定义 skills loading 与 prompt dump 范围
- [x] 1.2 实现 `skills/loader.ts` 和 `prompt/inspect.ts`，支持向上发现 skill roots、frontmatter 解析、按名加载与 stable prompt inspection

## 2. Runtime / Tool / Entrypoint

- [x] 2.1 接入 `AGENT_SKILLS` 选择式注入，并新增 `list_skills` / `load_skill` base tools
- [x] 2.2 增加 `dump-system-prompt` 轻量入口，并同步 CLI dispatcher help

## 3. CLI / TUI 产品面

- [x] 3.1 增加 `/skills`、`/skill <name>`、`/prompt`，并同步 help、completion、palette、TUI command surface
- [x] 3.2 增加 focused tests 覆盖 skill loader、tool surface、CLI 命令和 prompt dump 入口

## 4. 验证

- [x] 4.1 运行 focused tests、build 与差异检查
- [x] 4.2 运行 OpenSpec strict 校验并确认参考架构页的剩余缺口已经收口
