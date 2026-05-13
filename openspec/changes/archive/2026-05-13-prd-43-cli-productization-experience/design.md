## Context

当前 CLI 已经具备 agent 能力，但产品体验仍偏工程原型：

- 默认启动直接出现 prompt，缺少清晰欢迎区、状态摘要和下一步引导。
- slash command 体系不完整，用户需要记住隐含能力。
- 配置错误通常在运行时爆出，缺少主动诊断和修复建议。
- 工具调用、后台任务、scheduler、MCP、hook 等事件已经存在，但终端呈现还不够统一。
- TUI 已有命令式底座，但视觉层级和命令覆盖还比较基础。

本轮目标是把 CLI 从“能用”推进到“像产品一样可持续使用”。

## Goals / Non-Goals

**Goals:**

- 建立统一 CLI UI renderer，让普通 CLI 和 TUI 共享视觉语言。
- 提供明确的 first-run / startup 状态展示。
- 提供配置诊断与可执行修复建议。
- 提供可发现的 slash command 体系。
- 提供接近 Claude Code 的运行控制面：model、permissions、usage、compact、workspace roots、shell shortcut。
- 提供美观、紧凑、稳定的工具调用与任务进度展示。
- 让每轮完成后有 closeout summary，而不是只输出 assistant 文本。

**Non-Goals:**

- 不引入大型 TUI 框架。
- 不做 Web UI。
- 不做跨机器部署、认证或组织管理。
- 不修改核心 agent runtime 决策逻辑。

## Decisions

### Decision 1: 抽出 CLI UI renderer

采纳：

- 新增 `cli-ui` 边界，负责 banner、status line、section、table、command help、error、tool event、closeout summary。
- renderer 输出纯字符串，易测、可复用、可降级。

不采用：

- 在 `cli.ts` 和 `tui.ts` 中手写 ANSI 文案。

原因：

- 当前入口会继续增加，手写文案会造成风格漂移。纯 renderer 可以先不引入 UI 框架，同时保持美观一致。

### Decision 2: Slash command 作为产品导航层

采纳：

- 新增 slash command parser / dispatcher。
- 普通自然语言仍走 `runUserQuery`，slash command 不进入模型。

不采用：

- 让模型解释所有 `/` 命令。

原因：

- 产品导航命令需要稳定、低成本、可预测，不能依赖模型自由解释。

### Decision 3: Doctor 先做本地静态诊断

采纳：

- 检查 Node/package、模型环境、workspace 写权限、MCP config、hook config、重要目录、release check 可用性。
- 输出 severity、status、reason、suggestion。

不采用：

- 自动联网检测供应商 API 或自动修改用户配置。

原因：

- 当前环境经常网络受限；本轮先做本地可靠诊断，自动修复放后续。

### Decision 4: 美观优先但保持终端稳健

采纳：

- 使用有限 ANSI 色彩、ASCII fallback、固定宽度截断、无 emoji 默认。
- 输出按 `header -> status -> details -> next action` 组织。

不采用：

- 大面积 box drawing、动画、复杂光标控制。

原因：

- CLI 产品化的关键是清晰稳定，过度装饰会影响日志复制、CI 和远程终端。

### Decision 5: CLI 产品面优先暴露已有 runtime 能力

采纳：

- 将 model policy、security approvals、context compact、workspace roots 这些现有 runtime 能力直接提升成 slash commands。
- `/clear` 改为“开始新会话”，`/redraw` 专门负责清屏重绘。
- TUI 捕获 tool/runtime 的控制台事件并转入 activity 面板，避免打碎布局。

不采用：

- 继续只在底层保留这些能力，让用户依赖模型自行发现。

原因：

- 这类能力已经存在于系统内部，但没有产品入口时，对终端用户几乎等于不存在。对齐 Claude Code 的差距，最有价值的工作就是把它们变成稳定可发现的控制面。

## Risks / Trade-offs

- [Risk] UI 打磨影响已有测试输出 -> Mitigation：renderer 独立测试，交互 CLI 保持核心行为不变。
- [Risk] slash command 与自然语言冲突 -> Mitigation：只有首字符为 `/` 且匹配已知命令才拦截，未知命令给帮助提示。
- [Risk] doctor 误报 -> Mitigation：只做确定性本地检查，建议措辞保持可操作但不自动修改。
