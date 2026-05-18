# AGENTS 执行规则

本文档是当前工作区唯一规则源。后续统一维护本文档，不再单独维护 `AGENT.md`、`WORKSPACE_AGENT_RULES.md` 或 `COMMIT_CONVENTION.md`。

## 1. 语言规则

- 与用户沟通默认使用中文（简体）。
- 仅在以下场景使用英文：
  - 用户明确要求英文；
  - 代码标识符、命令、路径、日志、报错原文；
  - 第三方接口字段必须保持英文。
- 新增或修改文档时优先中文，必要时补充英文术语原词。

## 2. 编码与文本

- 所有文本文件使用 UTF-8 编码。
- 避免乱码；如修复历史乱码，保持语义不变，并在变更说明中注明。
- 非必要不混用全角和半角标点。

## 3. 默认任务流程（OpenSpec）

1. 先阅读对应 PRD，例如 `prd/incremental/PRD-XX-*.md`。
2. 按 OpenSpec 流程推进：`new change -> artifacts -> implement -> validate -> archive`。
3. 每个 PRD 完成后先验收，再提交。

### 3.1 OpenSpec / Superpowers 职责分工工作流

核心原则：OpenSpec 只管需求、设计、任务和文档；Superpowers 只管写代码、改代码、测试和运行。

职责分工：
- OpenSpec：负责需求分析、架构设计、生成任务清单。
- Superpowers：负责按照任务清单编写代码、测试、重构、运行。
- 长期规划文档统一维护在 OpenSpec 中，不再维护 `docs/superpowers/`。

执行顺序：
1. 先用 OpenSpec 完成设计：`/openspec:proposal`。
2. OpenSpec 输出 `tasks.md` 任务列表。
3. 再交给 Superpowers 按任务执行代码。

禁止行为：
- 禁止 Superpowers 跳过设计直接写代码。
- 禁止 OpenSpec 执行代码实现。
- 两个工具不互相替代、不互相覆盖。
- 禁止新增 `docs/superpowers/plans/`、`docs/superpowers/specs/` 等 Superpowers 长期计划文档。

固定使用模板：

```text
请严格遵守 AGENTS.md 的职责分工
OpenSpec 只做需求分析、架构设计和任务拆解
Superpowers 只做代码实现、测试、调试和运行
不要互相越权
```

OpenSpec 文档位置：
- 需求与方案：`openspec/changes/<change-name>/proposal.md`
- 设计与决策：`openspec/changes/<change-name>/design.md`
- 任务清单：`openspec/changes/<change-name>/tasks.md`
- 规范变更：`openspec/changes/<change-name>/specs/**/spec.md`

Superpowers 执行规则：
- 只读取 OpenSpec 的 `tasks.md` 和相关设计文档作为执行输入。
- 可以在对话中说明执行计划，但不落盘维护 Superpowers 计划文档。
- 测试、调试、运行结果只在最终汇报中说明；除非 OpenSpec 明确要求，不新增长期执行记录。

标准工作流：

1. OpenSpec 做设计：

```text
/openspec:proposal 实现飞书文档同步到 GitHub
```

2. OpenSpec 输出任务：

```text
把设计拆成可执行的任务列表 tasks.md
```

3. Superpowers 执行代码：

```text
Superpowers 按照 tasks.md 里的任务依次实现
只做代码开发、测试和调试，不修改设计
```

一句话原则：
- OpenSpec = 产品经理 + 架构师。
- Superpowers = 程序员 + 测试。

## 4. 执行与打断规则

- 遇见简单问题，默认直接执行，不为确认细节而额外打断用户。
- 对于没有安全风险、不会造成破坏、不会引入高成本副作用的操作，默认直接执行，不中途征求许可。
- 对于边界收口、模块拆分、OpenSpec 归档这类连续架构收口操作，Agent 应自行阅读源码与文档、选择下一步并执行到本地提交，不要停下来让用户决定下一块做什么。
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

### 5.1 通用编码思想钢印

- 失败要尽早、明确、可见。除非需求明确要求，否则不要为了“看起来更稳”而补兜底逻辑。
- 异常与错误默认尽早上抛，不要在业务层内部吞错、改写或静默处理。
- 测试必须能证明问题真实存在。优先写“先失败、后修复、再通过”的测试；一开始就通过、无法证明问题存在的测试价值很低。
- 对外暴露的类型、接口、函数、类必须补充注释；关键逻辑分支应补充说明其功能意图的注释。
- 能复用 `utils` 中已有工具函数时，优先复用；若发现可沉淀的公共逻辑，应先抽到 `utils` 再复用，避免同类逻辑分散复制。
- 单元测试目录必须在现有 `test/unit/` 体系内严格镜像源代码目录结构；每个单元测试文件只测试其对应源文件的功能，不跨文件混测。
- 类型应始终复用其所属库或模块的源类型；不要为了绕过 TypeScript 问题而在本地重复定义近似类型，也不要随意把值强转成临时占位类型。
- 避免没有实际收益的抽象层；如果某层封装既没有简化代码，也没有守住真实边界，就应优先直接调用所属模块或服务，而不是在层间传递宽泛包装对象。
- 除非 TypeScript 不能正确推断，或为了维持公开契约必须显式声明，否则不要随手给函数补显式返回类型。
- 不要为了“看起来更整洁”就抽取一次性辅助函数；只有在它能保留真实边界、隐藏有意义复杂度，或预期会被复用时才抽取。单次、简单逻辑优先内联。

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
- 每次提交或交接之前必须再次清理，并确认测试产物没有残留。
- 以下目录或文件默认视为运行 / 测试产物，不纳入 commit：
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
- 每次完成任务后只执行到本地 `git commit`，不要执行 `git push`。
- 最后的远端推送由用户手动执行；如需提醒，只在最终汇报中说明当前提交 hash 和分支状态。

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
4. `openspec validate "<name>" --type change`

## 12. 测试目录规则

- `apps/agent-cli` 的所有测试文件统一放在 `apps/agent-cli/test/` 下。
- 单元测试放在 `apps/agent-cli/test/unit/`。
- smoke、regression、集成验证放在 `apps/agent-cli/test/smoke/`。
- 不再把测试文件放在 `apps/agent-cli/src/` 根部、`src/**` 业务目录旁边或包根目录。
- 新增测试脚本、文档示例和命令时，路径也必须指向 `test/` 目录。

## 13. 失败处理规则

- 先给出可读错误原因，再给出修复动作。
- 遇到沙箱限制可申请提权后重试。

## 14. 优先级

- 若与系统或平台更高优先级指令冲突，以更高优先级为准。
