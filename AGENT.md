# AGENT 执行规则

本文档是当前工作区唯一规则源。后续统一维护本文档，不再单独维护 `WORKSPACE_AGENT_RULES.md` 或 `COMMIT_CONVENTION.md`。

## 1. 语言规则

- 与用户沟通默认使用中文（简体）。
- 仅在以下场景使用英文：
  - 用户明确要求英文；
  - 代码标识符、命令、路径、日志、报错原文；
  - 第三方接口字段必须保持英文。
- 新增或修改文档时优先中文，必要时补充英文术语原词。

## 2. 编码与文本

- 所有文本文件使用 UTF-8 编码。
- 避免乱码；若修复历史乱码，保持语义不变，并在变更说明中注明。
- 非必要不混用全角和半角标点。

## 3. 默认任务流程（OpenSpec）

1. 先阅读对应 PRD，例如 `prd/incremental/PRD-XX-*.md`。
2. 按 OpenSpec 流程推进：`new change -> artifacts -> implement -> validate -> archive`。
3. 每个 PRD 完成后先验收，再提交。

## 4. 执行与打断规则

- 遇见简单问题，默认直接执行，不为确认细节而额外打断用户。
- 对于没有安全风险、不会造成破坏、不会引入高成本副作用的操作，默认直接执行，不中途征求许可。
- 仅在以下情况打断用户：
  - 涉及破坏性操作；
  - 可能导致数据丢失；
  - 需要用户提供缺失信息；
  - 明显存在安全、权限、资金或外部系统风险。

## 5. 代码变更原则

- 单文件单职责，保持模块边界清晰。
- 工具层保持薄适配，业务逻辑放在独立模块。
- 不做与当前任务无关的重构或格式化噪音改动。
- 不使用破坏性 Git 命令（如 `reset --hard`），除非被明确要求。

## 6. 完成后汇报要求

- 每次任务完成后必须给出“改动点总结”，至少包含：
  - 修改了哪些文件；
  - 每个文件改了什么；
  - 核心实现逻辑；
  - 验证方式（命令与结果）。

## 7. 包管理器规则

- 统一使用 `pnpm`，不再新增 `npm` 工作流约定。
- 新增文档、脚本、命令示例时，优先写 `pnpm` 命令。

## 8. 清理规则

- 每次测试产生的运行产物、临时数据和缓存内容，在本次开发结束后就删除，不留到下一轮。
- 每次 `git push` 之前必须再次清理并确认测试产物没有残留。
- 以下目录或文件默认视为运行/测试产物，不纳入 commit：
  - `apps/agent-cli/.tasks/`
  - `apps/agent-cli/.team/`
  - `apps/agent-cli/.worktrees/`
  - `apps/agent-cli/.transcripts/`
  - `apps/agent-cli/tmp/`
  - `apps/agent-cli/.memory/`（如为临时测试数据）
  - `apps/agent-cli/.audit/`
  - `apps/agent-cli/.observability/`
  - `apps/agent-cli/.security/`

## 9. 提交内容规则

- 允许提交：
  - 源码变更（如 `apps/agent-cli/src/`、`apps/web-console/src/`）；
  - 必要文档变更（如 `prd/`、`openspec/`）。
- 禁止提交：
  - 临时脚本；
  - 本地快照；
  - 持久化运行数据。
- 每次提交后执行 `git push`。

## 10. Commit Message 规范（Conventional Commits）

格式：

`<type>(<scope>): <subject>`

示例：

- `feat(api): add user profile endpoint`
- `fix(parser): handle empty input`
- `docs(readme): clarify setup steps`
- `chore(git): enforce commit message format`

允许的 `type`：

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `chore`
- `revert`

规则：

- `scope` 可选，但建议填写。
- `subject` 使用祈使语气，简洁明确。
- 破坏性变更使用 `!`，例如：`feat(api)!: remove v1 endpoint`。

仓库校验：

- `.githooks/commit-msg` 校验提交首行格式。
- `.gitmessage.txt` 作为默认提交模板。

## 11. 验证规则

每次实现至少执行：

1. `pnpm build`
2. 对应 PRD 的 smoke / 回归测试
3. `openspec status --change "<name>" --json`
4. `openspec validate --changes "<name>"`

## 12. 失败处理规则

- 先给出可读错误原因，再给出修复动作。
- 遇到沙箱限制可申请提权后重试。

## 13. 优先级

- 若与系统或平台更高优先级指令冲突，以更高优先级为准。
