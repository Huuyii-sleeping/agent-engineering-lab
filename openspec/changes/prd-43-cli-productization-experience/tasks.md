## 1. PRD 与规格

- [x] 1.1 新增 PRD-43，明确 CLI 产品化体验范围、非目标和验收标准
- [x] 1.2 新增 OpenSpec proposal / design / delta spec / tasks

## 2. Terminal UI Renderer

- [x] 2.1 新增共享 `cli-ui` renderer：banner、status、section、table、help、error、closeout
- [x] 2.2 让默认 CLI 和 TUI 复用 renderer，统一视觉语言
- [x] 2.3 支持颜色开关、无颜色 fallback、宽度截断和稳定快照测试

## 3. Slash Commands

- [x] 3.1 新增 slash command parser / dispatcher
- [x] 3.2 支持 `/help`、`/status`、`/config`、`/tools`、`/sessions`、`/doctor`、`/theme`、`/clear`
- [x] 3.3 未知命令返回稳定帮助提示，不进入模型

## 4. Doctor 与状态

- [x] 4.1 新增本地 doctor checks：模型配置、workspace、MCP、hooks、权限、关键目录
- [x] 4.2 新增状态聚合：session、model、workspace、tools、MCP、bridge、scheduler
- [x] 4.3 输出 severity、reason、suggestion，避免自动修改用户配置

## 5. 产品化事件与收尾

- [x] 5.1 统一 tool/background/scheduled/approval 事件呈现
- [x] 5.2 增加任务型 closeout summary renderer
- [x] 5.3 覆盖 focused tests、build、OpenSpec strict

## 6. Claude Code 风格控制面补齐

- [x] 6.1 扩展 slash commands：`/model`、`/permissions`、`/cost|/usage`、`/compact`、`/add-dir`、`/redraw`
- [x] 6.2 将 `/clear` 语义切换为“开始新会话”，保留界面重绘能力给 `/redraw`
- [x] 6.3 暴露权限模式、审批队列、模型用量/成本、workspace roots 状态
- [x] 6.4 支持 `!<cmd>` 直连 shell shortcut，并复用现有 security/tool runtime
- [x] 6.5 让 TUI 吸收 runtime/tool 事件到 activity 面板，保持全屏布局稳定
