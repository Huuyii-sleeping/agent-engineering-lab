# PRD-75 Session 存储与 Resume 恢复强化

## 背景

参考 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/04i-session-storage-resume.md`，Claude Code 的 session storage / resume 设计强调把 transcript 作为 append-only JSONL 事实源，并通过轻量读取、metadata 重挂和恢复链路修复来支撑可靠 resume。

当前仓库已经具备 `.sessions/session_<id>.json` 快照式持久化、跨宿主重启恢复、敏感信息脱敏和 retention 元数据，但仍存在几个差距：

- session 持久化只有覆盖式 JSON 快照，缺少 append-only journal 作为可审计事实源。
- 恢复时只能读取完整 JSON 快照，无法从连续事件日志重建 session。
- session 删除只处理快照文件，没有同步处理 session 级 journal。
- 没有明确区分快照 summary 与 transcript 事件流，后续 resume、调试和局部读取会继续被大 JSON 文件约束。

## 目标

- 为每个 service session 增加 append-only JSONL journal，记录 session 创建、chat 轮次完成和持久化快照事件。
- 让 session 恢复优先从 journal 重建，journal 不可用时兼容读取现有 `.json` 快照。
- 保持现有 HTTP `/sessions`、`/sessions/:id` 和 `/chat` shape 兼容。
- 持续复用现有脱敏、retention 和 no-persistence 开关。
- 删除 session 时同步删除对应 journal，避免孤儿恢复数据。

## 非目标

- 不实现外部 remote ingress 或云端会话同步。
- 不实现完整 Claude Code sidechain transcript、fork/branch 修复或远端 session 图。
- 不新增独立 resume UI。
- 不改变现有 `.transcripts/` compact snapshot 行为。

## 验收标准

- 单元测试证明 session journal 是 JSONL append-only，并记录同一 session 的多次保存事件。
- 单元测试证明新 `SessionStore` 可以从 journal 恢复 session history 与 runtime state。
- 单元测试证明旧 `.json` 快照仍可兼容加载。
- 单元测试证明删除 session 会同时清理 `.json` 快照与 `.jsonl` journal。
- smoke 测试覆盖一次 create -> save -> reload -> continue chat 等价路径。
- `openspec status --change "prd-75-session-storage-resume-hardening" --json` 显示完成。
- `openspec validate "prd-75-session-storage-resume-hardening" --type change` 通过。
- `pnpm build` 与相关定向测试通过。
