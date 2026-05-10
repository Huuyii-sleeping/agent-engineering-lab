# Memory 模块说明

本目录是 `agent-cli` 的记忆子系统实现。

目标：

- 将 memory 业务逻辑独立于 tool 注册层；
- 保持单文件单职责；
- 对外 API 稳定，兼容 agent loop 中的 tool 调用。

## 架构

调用链：

1. 工具层：`src/tools/memory.ts`
2. 服务层：`src/memory/service.ts`
3. 细分子模块：`store/retrieval/injection/extractor/scorer/...`

数据落盘：

- 运行时记忆文件位于当前工作目录下 `.memory/`
  - `.memory/short_term.jsonl`
  - `.memory/long_term.jsonl`

## 文件职责

- `types.ts`
  - 领域类型定义（`MemoryType`、`MemoryLayer`、`MemoryEntry`、`SearchHit`）

- `response.ts`
  - 面向 tool 返回值的统一 JSON 字符串封装：
    - `ok(...)`
    - `fail(...)`

- `normalize.ts`
  - 输入归一化与安全默认值：
    - memory type 归一化
    - tags 清洗与数量上限
    - confidence 夹紧到 `[0, 1]`
    - 文本归一化工具

- `jsonl.ts`
  - JSONL 解析与序列化工具
  - 解析时容忍坏行（跳过 malformed line）

- `store.ts`
  - 持久化边界
  - 确保 memory 文件存在
  - 写入 short-term 与 long-term 两层
  - long-term 按“归一化内容 + type”去重合并
  - short-term 按运行时配置做容量截断

- `scorer.ts`
  - 检索打分与 token 粗估
  - 使用轻量混合评分：关键词重叠 + 字符 bigram 相似度 + confidence

- `extractor.ts`
  - 从用户文本做启发式候选抽取
  - 生成结构化候选（`type/content/confidence/tags`）供自动记忆写入

- `retrieval.ts`
  - 搜索/列表编排工具：
    - 层解析（layer parsing）
    - limit 解析
    - 多层聚合
    - 过滤与排序

- `injection.ts`
  - 基于排序命中的 `SearchHit[]` 构建 `<memory_context>...</memory_context>` 注入块
  - 约束 top-k 与 token 预算

- `service.ts`
  - 供外部调用的统一 API 面
  - 对外函数：
    - `runMemoryAdd`
    - `runMemorySearch`
    - `runMemoryList`
    - `autoExtractMemory`
    - `buildMemoryInjectionForQuery`
  - 仅做编排，不承载底层细节实现

## 对外 API 契约

tool-facing 函数返回 JSON 字符串：

- `runMemoryAdd(...)`
  - 成功：`{ ok: true, entry: ... }`
  - 失败：`{ ok: false, error: { code, message } }`

- `runMemorySearch(...)`
  - 成功：`{ ok: true, query, hits: SearchHit[] }`
  - 失败：`{ ok: false, error: { code, message } }`

- `runMemoryList(...)`
  - 成功：`{ ok: true, memories: [{ layer, entry }] }`

注入函数返回结构化对象：

- `buildMemoryInjectionForQuery(query)`
  - `{ content: string | null, usedEntries: number, estimatedTokens: number }`

## 运行时配置

配置定义于 `src/runtime-config.ts`：

- `AGENT_MEMORY_SHORT_TERM_LIMIT`
  - short-term 最大保留条数

- `AGENT_MEMORY_SEARCH_DEFAULT_LIMIT`
  - memory search 默认返回条数

- `AGENT_MEMORY_INJECT_TOP_K`
  - 注入阶段最多考虑的命中数

- `AGENT_MEMORY_INJECT_MAX_TOKENS`
  - 注入块的近似 token 上限

## 关键设计说明

- 工具层保持薄：
  - `src/tools/memory.ts` 只定义 schema 与转发调用
- 业务逻辑可测试：
  - 主要逻辑集中在 `src/memory/*`
- 保持 JSON 字符串兼容：
  - 现有 tool runtime 仍以字符串作为函数返回值
- 注入避免 JSON 往返：
  - 注入流程直接使用结构化 hits，不再先走 tool JSON 再反序列化

## 验证

常用命令：

```bash
pnpm build
pnpm test:memory
pnpm test:regression
```

memory smoke 测试文件：

- `test/smoke/prd08-memory-smoke.ts`

## 扩展点

- 在 `scorer.ts` 中将 `scoreEntry` 替换为 embedding/vector 检索
- 将 `extractor.ts` 从规则抽取升级为模型辅助抽取
- 在 `store.ts` 增强元数据与索引（例如 TTL、source 分类、多项目命名空间）
