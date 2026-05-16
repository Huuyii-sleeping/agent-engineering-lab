## Why

当前仓库已经具备审批门禁、路径越界拦截、MCP 统一接入和结构化 observability，但对照 `02-security-analysis.md` 仍有几类缺口没有补齐：敏感参数仍可能原样写入 `.security/approvals.json`、`.audit`、`.observability` 和 `.memory`，外部 MCP 文本还可能带着不可见 Unicode 控制字符进入本地 runtime，而 `bash` 执行链路也缺少更强的高危模式收口与 Git 逃逸后的清理。

当前仓库没有独立的云 telemetry / Team Memory sync 产品面，因此这轮不去硬造远端同步体系；改为把 02 中能映射到本仓库的本地等价面一次收口：shell runtime、MCP ingress、memory、approval/audit、observability。

## What Changes

- 新增共享的安全数据卫生能力，统一处理 secret-like 文本脱敏、隐藏控制字符清洗和稳定 scope fingerprint。
- 强化 `bash` 执行链路：高危解释器 / shell / 远程执行模式进入显式审批边界，子进程执行前清理危险继承环境，执行后清除新植入的可疑 bare Git repo。
- 调整 security approval / audit 持久化：审批记录保存 redacted scope preview 与 scope hash，而不是原始参数快照。
- 调整 memory 持久化：`memory_add` 与自动抽取写入前先做敏感信息脱敏。
- 调整 observability 事件落盘：事件 payload 写入前统一清洗隐藏字符并脱敏敏感值，同时收敛 MCP 工具标识的隐私暴露。
- 调整 MCP 元数据与工具输出归一化：description、text content、structured content 在暴露给本地 runtime 前先清洗。
- 删除 `docs/learning/claude-code/` 学习沉淀目录，并移除 README 中仍在引用该目录的入口；对话交接和其他文档保留。

### In Scope

- secret-like 文本的最小可用脱敏规则
- hidden Unicode control / bidi 字符清洗
- bash 高危模式审批、Git 相关执行环境清理与 bare repo scrub
- approval scope hash + redacted preview
- memory / observability / MCP 三条落点接入
- observability 中 MCP 标识的最小隐私收口
- focused unit / smoke tests
- 学习沉淀目录删除与 README 入口清理

### Out of Scope

- 认证、授权、TLS 或远端身份体系
- 系统级 namespace / seccomp sandbox
- 完整 DLP / secret scanner 平台
- 文件内容的全仓库扫描或提交前 hook
- 独立的云 telemetry / Team Memory sync 服务
- Web 端安全策略

## Capabilities

### New Capabilities

- `security-data-hygiene`: 定义敏感数据脱敏、隐藏控制字符清洗与审批 scope 指纹的统一契约

### Modified Capabilities

- `core-agent-loop`: `bash` 执行安全约束从简单黑名单扩展到高危模式审批、继承环境清理与 bare repo scrub
- `memory-knowledge-retrieval`: 记忆落盘前增加敏感内容脱敏要求
- `mcp-external-capability-bus`: MCP 元数据与输出在进入本地 runtime 前增加清洗要求
- `observability-replay-debug`: observability 落盘前增加敏感内容脱敏与隐藏字符清洗要求

## Impact

- 影响代码：`apps/agent-cli/src/tools/security-*`、`apps/agent-cli/src/tools/bash.ts`、`apps/agent-cli/src/memory/*`、`apps/agent-cli/src/observability/*`、`apps/agent-cli/src/tools/mcp-*`
- 影响测试：security / bash / mcp / memory / observability 的 unit 与 smoke
- 影响文档：根 `README.md` 与 `docs/learning/claude-code/`
