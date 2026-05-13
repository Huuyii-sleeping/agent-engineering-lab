# PRD-43 CLI 工具产品化体验

## 背景

当前 CLI 已经有完整 Agent 能力、多入口、TUI 底座、Bridge 和 MCP 管理面。下一步最应该做的是把“能用的 CLI”打磨成“愿意每天使用的 CLI 产品”：启动清晰、命令可发现、状态可理解、错误能恢复、输出美观且稳定。

## 目标

- 建立统一终端视觉语言。
- 提供 slash command 导航层。
- 提供本地配置 doctor。
- 对齐 Claude Code 风格的高频控制面：model、permissions、usage、compact、workspace roots。
- 产品化工具调用、后台事件和任务进度展示。
- 提供任务完成后的 closeout summary。

## In Scope

- 默认交互 CLI 和 TUI 的产品体验。
- `cli-ui` renderer。
- slash commands：`/help`、`/status`、`/config`、`/tools`、`/sessions`、`/doctor`、`/theme`、`/clear`、`/redraw`、`/model`、`/permissions`、`/cost`、`/usage`、`/compact`、`/add-dir`。
- `!<cmd>` 直连 shell shortcut，并复用现有安全门与 tool runtime。
- 本地 doctor checks：模型配置、workspace、MCP、hooks、权限、关键目录。
- 多 workspace root 管理与路径边界放开。
- tool/background/scheduled/approval 事件展示。
- closeout summary。

## Out of Scope

- Web Console。
- 公网 Remote/Bridge。
- 账号体系、多租户和权限后台。
- 大型 TUI 框架或复杂动画。
- QueryEngine 核心语义变更。

## 体验原则

- 美观但克制：清晰层级、有限色彩、稳定布局。
- 可复制：输出适合复制到 issue、PR 或日志。
- 可降级：无颜色终端、CI、远程 SSH 中仍可读。
- 可发现：用户不需要读源码也能找到常用能力。
- 可恢复：错误输出必须包含原因和下一步动作。

## 验收标准

- 默认启动显示产品化 banner 和状态摘要。
- `/help` 能列出命令、用途和示例。
- `/doctor` 能发现关键配置问题并给修复建议。
- `/status` 能展示 session、model、workspace、tools、MCP、bridge、scheduler 状态。
- `/model`、`/permissions`、`/cost`、`/compact`、`/add-dir` 能工作于本地 CLI/TUI 而不是只输出占位文本。
- `/clear` 语义对齐为“开始新会话”，`/redraw` 负责重绘界面。
- 工具调用和后台事件以统一格式展示。
- TUI 的 activity 区域能吸收 tool/runtime 事件，而不是打碎全屏布局。
- 任务型会话完成后输出 closeout summary。
- focused tests、build、OpenSpec strict 通过。
