## Context

当前 `SessionStore` 使用 `.sessions/session_<id>.json` 保存 session 快照，并在宿主初始化时全量读取这些快照。这个实现已经具备跨宿主重启恢复、脱敏、retention metadata、no-persistence 开关和删除入口，但它仍是覆盖式存储：每次保存都会替换同一个 JSON 文件。

参考 Claude Code session storage / resume 分析，session 恢复更适合拥有 append-only transcript/journal 作为事实源。这样即使快照文件写入失败或需要后续做轻量读取，也能从连续事件中恢复最新会话状态。本轮只做本地底座，不扩大到远端 ingress 或完整 sidechain transcript。

## Goals / Non-Goals

**Goals:**

- 为每个 service session 增加 `.sessions/session_<id>.jsonl` append-only journal。
- 每次保存先追加 journal，再更新兼容快照文件。
- `load/list` 优先从 journal 的最后有效记录恢复 session，journal 不存在时读取旧 `.json` 快照。
- `delete` 同步删除快照与 journal。
- 保持现有 HTTP session summary/detail shape 不变。

**Non-Goals:**

- 不实现远端 ingress、云同步或跨设备 resume。
- 不实现 fork/branch 修复、sidechain transcript 或完整会话图。
- 不改变 `.transcripts/` compact snapshot。
- 不引入 SQLite、数据库或新依赖。

## Decisions

### 1. 使用 per-session JSONL journal，而不是全局 transcript 文件

决策：每个 session 维护一个 `.sessions/session_<id>.jsonl`，每行是一个完整 envelope，包含 schemaVersion、kind、event、createdAt、expiresAt 和脱敏后的 session 快照。

备选方案：使用单个 `.sessions/transcript.jsonl` 承载所有 session。

不采用原因：全局文件需要额外索引和并发切分；当前 `SessionStore` 已经按 session 串行写入，per-session journal 更贴合现有边界，恢复和删除也更简单。

### 2. journal 作为恢复优先事实源，JSON 快照保持兼容输出

决策：`SessionStore.save` 追加 journal 后继续写 `.json` 快照；`load` 优先读取 journal 最后一条有效 session 记录，失败或不存在时回退到 `.json`。

备选方案：直接废弃 `.json` 快照，只保留 JSONL。

不采用原因：现有测试、运维习惯和旧文件兼容依赖 `.json`；本轮目标是强化 resume 底座，不做破坏性迁移。

### 3. 复用现有脱敏、retention 与 no-persistence 开关

决策：journal 行内容复用当前 `toPersistedSessionEnvelope` 的脱敏与 metadata 构造；`AGENT_PRIVACY_PERSISTENCE_MODE=disabled` 时不写 journal 或快照。

备选方案：journal 只记录未脱敏差异事件。

不采用原因：未脱敏 transcript 是高敏数据，和既有本地治理要求冲突；差异事件还会引入重放顺序和 schema 迁移复杂度。

### 4. list 从 journal 与旧快照合并恢复

决策：`list` 同时扫描 `session_*.jsonl` 与 `session_*.json`，同 id 优先使用 journal 结果，旧快照只作为兼容来源。

备选方案：`list` 只读 journal。

不采用原因：历史仓库中已有 `.json` 快照必须仍可恢复，否则会破坏现有 session persistence 契约。

## Risks / Trade-offs

- [Risk] 每次保存同时写 journal 和快照，磁盘写入增加。Mitigation：本轮 session 内容规模较小，且继续按 session 串行写；后续可加 compact/checkpoint。
- [Risk] journal 只记录全量快照而不是增量事件，文件会增长。Mitigation：保持实现简单和可恢复，后续再做 journal compaction。
- [Risk] journal 解析遇到坏行。Mitigation：读取最后一条可解析且未过期的 session 行；全部不可用时回退旧快照。
