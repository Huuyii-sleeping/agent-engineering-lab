## Why

当前 Web Chat Console 已经具备基础 Chat 工作流，但仍缺少几个关键交互与呈现能力：未消费 BFF 已暴露的 SSE 事件流、assistant 消息不能按 Markdown 渲染、侧栏折叠按钮没有真实行为、历史会话列表过长，以及部分按钮仍依赖文字呈现。继续完善 Web 端前，需要先把这些高频体验问题补齐。

## What Changes

In Scope:
- Web 端接入 BFF `/api/events/stream` SSE，用于感知 agent 事件并刷新 session / transcript。
- assistant/system/tool 消息支持 Markdown 渲染，保留 user 消息的纯文本气泡。
- 实现左上角侧栏折叠/展开交互，并保持桌面与窄屏布局可用。
- 历史对话展示 agent service 返回的真实 session 列表；本地历史数据过多时清理旧 session 文件。
- 将刷新、主题切换、发送和快捷入口等可替换文案尽量图标化，并保留可访问名称。
- 更新 Web README 说明 SSE、Markdown、历史列表数据来源和侧栏折叠能力。

Out of Scope:
- 不新增 BFF endpoint。
- 不改变 agent service SSE 协议。
- 不实现 WebSocket。
- 不引入多页面路由、账号系统、模型选择或插件市场。
- 不清理或修改当前工作区已有的 agent-cli 非 Web 改动。
