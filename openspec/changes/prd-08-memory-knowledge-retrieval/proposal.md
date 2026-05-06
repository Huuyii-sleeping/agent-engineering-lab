## Why

当前 Agent 缺少可持续复用的记忆层。跨会话后，用户偏好、执行约束、历史决策无法稳定恢复，导致重复沟通与回答不一致。PRD-08 需要建立短期/长期记忆与检索注入机制，提升连续协作能力。

## What Changes

- 新增 `MemoryStore`：短期与长期分层持久化（`.memory/*.jsonl`）。
- 新增记忆工具：`memory_add`、`memory_search`、`memory_list`。
- 新增自动抽取：从用户输入抽取偏好/约束/决策并去重更新。
- 新增记忆注入：按相关度与 token budget 注入主循环。

## In Scope

- 记忆结构：`id/source/type/tags/content/confidence/updatedAt`
- 轻量检索：关键词重叠 + 字符 n-gram 近似
- 返回可解释结果：包含 `score`、`source`、`layer`
- 注入上限可配置，防止上下文膨胀

## Out of Scope

- 外部向量数据库接入
- 多租户云端记忆同步

## Capabilities

### New Capabilities
- `memory-knowledge-retrieval`: 持久化记忆、检索、自动抽取、注入

### Modified Capabilities
- `core-agent-loop`: 新增记忆注入步骤（受 token budget 限制）

