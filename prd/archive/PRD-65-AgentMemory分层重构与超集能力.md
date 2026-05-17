# PRD-65 Agent Memory 分层重构与超集能力

## 背景

本 PRD 对照 `liuup/claude-code-analysis` 的 `analysis/04-agent-memory.md`，只聚焦 Agent Memory 体系，不展开新的 OpenSpec proposal/design/tasks。

参考实现的核心不是一个隐藏 KV 或单表数据库，而是文件化、多层、可治理的 memory runtime：Auto Memory 负责长期协作记忆，Session Memory 负责长会话摘要断点，Agent Memory 负责某类 agent 的专属长期记忆，Team Memory 负责团队共享知识，Relevant Recall 负责按需召回，Snapshot 负责 agent memory 的初始化和升级，Compaction 负责 token 压缩和能力复灌。

当前仓库已经有 `.memory/short_term.jsonl`、`.memory/long_term.jsonl`、`memory_add`、`memory_search`、`memory_list`、自动抽取、自动注入、脱敏、TTL、session persistence、transcript snapshot 和基础 compact。但它仍偏向“轻量 JSONL 记忆工具”，还没有形成可比参考实现的“运行时基础设施”。本 PRD 的目标是把当前实现重构为比参考更完整、更可审计、更可治理的 memory 系统。

## 目标

- 建立文件化、多 scope、多生命周期的 memory 架构，替代只有 short_term/long_term 两层的扁平模型。
- 让 Agent Memory 成为 agent definition、system prompt、tool permission、snapshot、UI/governance 的一等运行时能力。
- 将 Session Memory 从普通 transcript compact 升级为可恢复、可审计、可安全更新的长会话摘要层。
- 将 recall 从简单关键词 JSONL 搜索升级为索引清单召回、去重、预算分配、可解释注入的组合检索。
- 保留当前已实现的脱敏、TTL、隐私模式和数据治理能力，并扩展到所有 memory scope。
- 对暂时不能实现的远端/团队同步、向量索引等能力明确留口，不假装已完成。

## 当前已具备能力

- `apps/agent-cli/src/memory/*` 已提供 memory store、retrieval、scorer、injection、extractor 和 tool-facing service。
- `apps/agent-cli/src/tools/memory.ts` 已暴露 `memory_add`、`memory_search`、`memory_list`。
- `.memory/short_term.jsonl` 和 `.memory/long_term.jsonl` 已支持本地持久化、long-term 去重、short-term 数量裁剪。
- 写入 memory 前已调用 `sanitizeAndRedactText`，并接入本地 retention metadata。
- `buildMemoryInjectionForQuery()` 已能按 topK 和 token budget 注入 `<memory_context>`。
- `AGENT_PRIVACY_MEMORY_MODE` 已提供 `default`、`manual_only`、`disabled` 的自动化开关基础。
- `SessionStore` 已支持 `.sessions` 持久化、脱敏、过期清理、同 session 写入队列和原子替换。
- `compact` 已支持手动压缩、transcript before/after snapshot、脱敏和 retention。
- `team`、`subagent` 已有独立 store/manager，但还没有绑定专属 memory namespace。

## 主要缺口

- 现有 memory 文档和部分规则存在中文 mojibake，`extractor.ts` 的中文触发词正则不可可靠工作。
- 当前 memory 只有 `short_term` / `long_term`，缺少 user、project、local、session、agent、team 等明确作用域。
- 缺少 `MEMORY.md` 入口索引和 topic markdown 文件，用户无法像知识库一样检查、编辑、删除单条记忆。
- 缺少 agent definition 中声明 memory scope 的能力，也没有在 agent system prompt 构建阶段注入 agent memory prompt。
- 缺少 agent memory 目录权限边界和 `isAgentMemoryPath()` 等路径归属判断。
- 缺少对声明 memory 的 agent 自动授予最小读写工具集合的闭环。
- 缺少 Agent Memory Snapshot，无法将某个 agent 的记忆作为可初始化、可升级、可分发资产。
- Session Memory 仍主要体现为 session history 和 compact transcript，没有独立 markdown 摘要文件、触发阈值、后台摘要代理和工具链断点保护。
- Recall 只做 entry-level keyword/ngram 打分，没有文件 manifest 选择、alreadySurfaced 去重、recentTools 关联、source provenance 和 why-injected 解释。
- Team Memory 仍是通信 inbox/requests，不是带 pull/push、watcher、checksum、locking、path validation、secret scanning 的共享知识层。
- compact 没有优先复用 Session Memory，也没有完整处理 tool_use/tool_result 链路、thinking 关联消息、工具能力复灌和附件复灌。
- JSONL store 写入缺少跨进程锁和通用原子写策略，强并发下可能丢写或覆盖。
- 隐私和治理 surface 还没有完整列出 memory class、scope、路径、保留策略、注入原因、导出/删除结果。
- 缺少跨 worktree、remote memory mount、多项目 git root 的 namespace 隔离策略。

## 产品范围

### In Scope

- Auto Memory、Session Memory、Agent Memory、Team Memory 的统一分层模型。
- 文件化 memory 目录、`MEMORY.md` 索引、topic markdown 正文、metadata 和索引重建。
- agent memory scope：`user`、`project`、`local`。
- memory path resolver、path sanitizer、path boundary guard。
- agent definition 与 memory 声明、system prompt 装配、最小读写工具注入。
- relevant recall、注入解释、token budget allocator、stale pruning、promotion/demotion。
- session memory markdown、后台摘要更新、compact 优先复用、断点保护。
- agent memory snapshot 初始化、更新提示、替换、标记已同步。
- memory governance CLI/doctor：列出、搜索、解释、导出、删除、禁用、重建索引。
- 当前 JSONL memory 的迁移和向后兼容。

### Out of Scope

- 云端托管 memory 服务。
- 跨组织多用户权限管理平台。
- 默认启用远端 team memory sync。
- 强依赖付费 embedding 服务的唯一检索路径。
- 将所有历史 transcript 全量长期保存。

## 分层架构要求

### FR-1 Memory Scope 与目录布局

系统必须支持以下 memory scope，并明确生命周期、可见性和默认目录：

- Auto Memory：用户/项目长期协作记忆，默认位于 `<memoryBase>/projects/<sanitized-git-root>/memory/`。
- Session Memory：当前 session 的摘要断点，默认位于 `.sessions/<sessionId>/memory.md` 或等价受保护目录。
- Agent Memory user scope：跨项目复用的 agent 专属记忆，默认位于 `<memoryBase>/agent-memory/<agentType>/`。
- Agent Memory project scope：当前项目共享的 agent 专属记忆，默认位于 `<cwd>/.agent/agent-memory/<agentType>/`。
- Agent Memory local scope：当前机器/当前 worktree 的本地 agent 专属记忆，默认位于 `<cwd>/.agent/agent-memory-local/<agentType>/`。
- Team Memory：repo 级共享知识层，默认位于 `<cwd>/.agent/team-memory/`，初期可标记为 reserved gap。

`memoryBase` 必须支持环境变量覆盖、本地默认目录和 remote mount 留口。所有路径必须经过 git root/project root 归一化、agentType 清洗、路径穿越防护和 workspace/worktree namespace 隔离。

### FR-2 文件化存储协议

每个文件化 memory 目录必须包含：

- `MEMORY.md`：入口索引，只包含 topic 链接、一行摘要、tags、更新时间和状态。
- `memories/*.md`：独立 topic 正文，每个文件只表达一个长期知识点或决策。
- `.metadata/index.json`：机器可读索引，记录 checksum、mtime、scope、source、confidence、redaction state、expiresAt。
- `.metadata/events.jsonl`：append-only 审计日志，记录 create/update/delete/recall/inject/snapshot/sync。

`MEMORY.md` 必须有硬限制：默认最多 200 行或 25KB。超过限制时系统必须拒绝直接追加并引导拆分 topic 文件。JSONL short/long memory 可保留为兼容层，但新写入的 durable memory 必须优先落到文件化协议。

### FR-3 Memory Prompt 与写入规则

系统 prompt 中必须生成统一 memory guidance：

- 说明 memory 目录已经存在或可由工具创建，不要求模型浪费一轮确认目录。
- 说明哪些内容应该保存：用户长期偏好、项目外部上下文、长期约束、跨会话决策、agent 专属经验。
- 说明哪些内容不应保存：可从代码直接推导的信息、短期任务状态、敏感凭证、重复日志、大段原始 transcript。
- 规定写入必须先创建或更新 topic markdown，再维护 `MEMORY.md` 索引。
- 规定更新过时记忆时必须修改原 topic，而不是简单追加冲突条目。
- 规定每次注入必须保留 provenance：scope、file、source、score、reason。

### FR-4 Agent Definition 绑定

agent 定义必须允许声明：

```yaml
memory:
  scope: user | project | local
  mode: read_write | read_only | disabled
  snapshot: optional
```

当 agent 声明 memory 且 memory 未被隐私模式禁用时：

- system prompt 构建阶段必须追加 agent memory prompt，而不是等运行中动态补。
- agent tool set 必须自动注入最小读写工具：read、write、edit 或等价受控 memory file tools。
- 权限系统必须识别 agent memory path，只有归属目录内的文件可被 agent memory tools 写入。
- UI/doctor 必须能显示 agentType、scope、memoryDir、entrypoint、snapshot status。

### FR-5 Agent Memory Snapshot

系统必须支持 snapshot 目录：

- `<cwd>/.agent/agent-memory-snapshots/<agentType>/snapshot.json`
- `<cwd>/.agent/agent-memory-snapshots/<agentType>/**/*.md`
- 本地 memory 目录中的 `.snapshot-synced.json`

snapshot 状态必须只有三类：

- `none`：无 snapshot 或无需动作。
- `initialize`：本地 memory 为空且存在 snapshot，可初始化。
- `prompt-update`：本地已有 memory，但 snapshot 更新于已同步版本，需要提示用户确认。

初始化必须只复制 snapshot 内容，不覆盖已有非空 memory。替换必须显式确认，并记录审计事件。`markSnapshotSynced()` 必须支持只更新同步元数据，不改正文。

### FR-6 Session Memory

系统必须把 Session Memory 从 transcript snapshot 中拆出来：

- 每个 session 拥有独立 `session-memory.md`，目录权限尽量使用 owner-only 语义。
- 初始化阈值默认不低于 10k tokens，更新阈值默认不低于 5k tokens。
- 工具调用次数、token 增量、自然断点必须共同参与是否提取摘要的判断。
- 后台摘要代理只能编辑精确 session memory 文件，不得读取或写入任意路径。
- Session Memory 必须记录摘要来源区间、lastMessageId、lastToolCallCount、updatedAt。
- compact 优先读取最新 Session Memory 作为边界摘要，避免重复消耗模型总结。

### FR-7 Relevant Recall

系统必须从“全量塞入 prompt”升级为“按需召回”：

- 扫描 `MEMORY.md` 和 topic header 生成 manifest。
- 对 alreadySurfaced 的 topic 做轮次级去重。
- recentTools、当前任务、active files、session summary、用户 query 都必须参与召回上下文。
- 默认最多召回 5 个 topic 正文，且必须受 token budget allocator 管控。
- 召回结果必须返回 `scope`、`path`、`score`、`reason`、`mtime`、`checksum`。
- 注入内容必须按优先级分配预算：system-critical > session-continuity > agent-specific > project-auto > team-shared > low-confidence。
- 如果召回内容冲突，必须降低注入优先级并提示需要用户或 agent 处理冲突。

### FR-8 Compaction 与能力复灌

compact 必须兼容 memory runtime：

- 自动 compact 前必须尝试使用 Session Memory。
- 截断消息时不得切断 tool_use/tool_result 链路。
- 对共享 message id、thinking stream、pending approval、active plan、active tools 必须保留 API invariant。
- compact 后必须复灌当前 tool schema、MCP tool delta、active plan、workspace attachments 和 memory injection state。
- compact 前后 transcript snapshot 必须继续脱敏、retention 和可删除。

### FR-9 Team Memory

Team Memory 初期可以保留为缺口，但接口和数据模型必须预留：

- pull/push 同步语义。
- watcher 检测本地变更。
- checksum 和 optimistic locking。
- path validation 和 secret scanning。
- 冲突状态：clean、dirty、conflict、remote-newer、local-newer。
- governance surface 必须明确显示 team sync 当前是 `reserved_gap`、`disabled` 或 `available`。

不得把当前 `.team/inbox` 通信能力描述为已完成 Team Memory。

### FR-10 治理、审计与隐私

所有 memory class 必须接入统一治理：

- `memory doctor` 或等价 CLI 显示所有 scope、路径、条目数、索引状态、保留策略、隐私模式、reserved gaps。
- `memory explain <query>` 显示为什么某条 memory 被召回或注入。
- `memory export` 支持按 scope/session/agentType 导出，默认脱敏。
- `memory delete` 支持按 id、path、scope、session、agentType 删除，并写审计事件。
- `memory rebuild-index` 支持从 markdown 文件重建 `.metadata/index.json`。
- `memory disable auto|inject|all` 必须分别关闭自动抽取、自动注入和全部 memory。
- 所有写入必须先做 secret scanning/redaction，禁止原始 secret 进入 durable memory。

### FR-11 并发和一致性

memory 写入必须满足：

- 单进程内按 scope/path 串行化写入。
- 跨进程写入使用 lock file 或原子 rename。
- topic 文件更新必须先写临时文件，再原子替换。
- `MEMORY.md` 和 `.metadata/index.json` 更新失败时必须可重试、可修复。
- 审计事件必须 append-only，不能因为索引重建丢失。

### FR-12 迁移策略

现有 JSONL memory 必须被平滑迁移：

- `short_term.jsonl` 保留为 session/ephemeral 兼容层。
- `long_term.jsonl` 可迁移到 Auto Memory 的 topic markdown。
- 迁移必须生成 `MEMORY.md` 索引和 `.metadata/index.json`。
- 迁移后原 JSONL 可保留只读备份，直到用户确认清理。
- 迁移工具必须支持 dry-run、diff、rollback metadata。

## 暂时保留缺口

- 远端 Team Memory sync 不在本 PRD 第一阶段强制实现，只要求接口、状态和治理输出诚实标记。
- embedding/vector retrieval 可以作为增强路径，不得替代 manifest + lightweight recall 的默认可离线方案。
- UI 文件选择器可先由 CLI/doctor 替代，但数据模型必须支持后续 UI 浏览、打开、编辑。
- Windows 文件权限无法完全等价 `0o700/0o600` 时，必须在 doctor 中显示 best-effort 和风险说明。
- 多用户云端权限、组织级审计、远端加密密钥管理暂不实现。

## 验收标准

- AC-1：新建 agent definition 声明 `memory.scope=project` 后，首次运行前 system prompt 中包含该 agent 的 memory guidance、memoryDir 和当前 `MEMORY.md` 内容。
- AC-2：声明 memory 的 agent 只能写入自己归属的 agent memory 目录，路径穿越和其他 scope 写入被拒绝并有审计记录。
- AC-3：新增 durable memory 时，系统创建 topic markdown，更新 `MEMORY.md`，写入 `.metadata/index.json` 和 `.metadata/events.jsonl`。
- AC-4：`MEMORY.md` 超过限制时不会继续膨胀，而是要求拆分或重建索引。
- AC-5：`memory explain` 能展示一次 query 中每条注入 memory 的 scope、path、score、reason、token cost。
- AC-6：Session 超过阈值后生成独立 session memory，compact 优先使用该摘要，并不切断 tool_use/tool_result 链路。
- AC-7：Agent Memory Snapshot 在本地为空时返回 `initialize`，在 snapshot 更新后返回 `prompt-update`，替换必须显式确认。
- AC-8：隐私模式 `manual_only` 下不自动抽取，但允许显式 memory 写入；`disabled` 下不抽取、不注入、不写 durable memory。
- AC-9：secret-like 内容写入任意 memory scope 前都被脱敏，导出和搜索结果不得包含原始 secret。
- AC-10：team memory 没有真正同步实现时，doctor 明确显示 `reserved_gap`，不得展示为已支持。
- AC-11：现有 `short_term.jsonl` / `long_term.jsonl` 数据可 dry-run 迁移为文件化 memory，并可回滚迁移元数据。
- AC-12：并发写同一 memory topic 不丢失审计事件，索引损坏后可通过 `memory rebuild-index` 恢复。

## 实施优先级

1. P0：修复 mojibake 文档和中文 extractor 规则，补齐 memory class/governance 的诚实展示。
2. P0：落地 memory path resolver、scope model、文件化协议、索引和原子写入。
3. P0：实现 agent definition memory 绑定、prompt 注入、最小工具授权和路径边界。
4. P1：实现 relevant recall、why-injected、token budget allocator 和 stale pruning。
5. P1：实现 Session Memory 摘要层，并让 compact 优先复用。
6. P1：实现 Agent Memory Snapshot 初始化、更新提示和同步元数据。
7. P2：实现 JSONL 到文件化 memory 的迁移工具。
8. P2：预留 Team Memory sync 接口并在 doctor 中展示 reserved gap。
9. P3：增加 embedding/vector retrieval、UI 文件选择器和远端 sync。

## 非目标声明

本 PRD 不要求一次性实现所有未来增强，但要求当前仓库不要继续把轻量 JSONL memory 描述成完整 Agent Memory。实现完成前，所有未完成的 Team Memory、Snapshot、Session Memory、Agent Scope 和 Recall 能力都必须在治理输出中明确标记为未完成或 reserved gap。
