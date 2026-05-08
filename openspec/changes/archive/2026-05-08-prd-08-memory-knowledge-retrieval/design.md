## Overview

实现三层能力：持久化层、检索层、注入层。

1) 持久化层（MemoryStore）
- 路径：`.memory/short_term.jsonl`、`.memory/long_term.jsonl`
- 短期层：滚动窗口，限制条数
- 长期层：按 `type + normalized(content)` 去重更新

2) 检索层（MemorySearch）
- 输入：`query`、`layer`、`limit`、`type`
- 评分：
  - 关键词重叠分
  - 字符 n-gram Jaccard 相似度
  - 置信度加权
- 输出：`score`、`source`、`layer`、完整条目

3) 注入层（MemoryInjection）
- 在主循环请求前，基于最新用户输入检索相关记忆
- 按 `memoryInjectTopK` 与 `memoryInjectMaxTokens` 截断
- 注入格式：`<memory_context>...</memory_context>`

4) 自动抽取（AutoExtract）
- 对用户输入句子做规则抽取：
  - 偏好：默认/习惯/偏好
  - 约束：必须/不要/禁止/每次
  - 决策：决定/采用/改为
- 抽取后写入 MemoryStore，长期层去重

