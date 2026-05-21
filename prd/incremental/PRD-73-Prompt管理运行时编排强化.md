# PRD-73 Prompt 管理运行时编排强化

## 背景

参考 `claude-code-analysis/analysis/04g-prompt-management.md` 对 Claude Code prompt 管理的拆解，当前项目已经实现了基础的 `src/prompt` 模块、稳定 prompt 与动态 system messages 分离、技能注入和受保护导出。但现有实现仍偏向“拼接字符串”，缺少 section 级元数据、缓存语义、上下文注入优先级和专项 prompt 的统一治理。

当前实现不足：

- `PromptSection` 只有 `id/title/content`，无法表达 `system/reminder/memory/user_context` 等 section 类型、是否可缓存、来源说明和 token 估算。
- stable prompt 和 dynamic messages 已分离，但没有对覆盖 prompt、追加 prompt、用户上下文和工具/运行时提醒建立显式优先级。
- `/prompt` inspection 只暴露 section id 和内容摘要，不能解释每个 section 为什么进入模型输入、是否稳定可缓存、估算 token 成本。
- compact、memory、runtime reminder 等专项 prompt 仍以普通字符串进入 dynamic messages，缺少集中协议来避免重复拼接和来源不明。
- 模型请求可发送多个 system message，但没有为 stable/dynamic section 提供可审计的 message-level metadata。

## 目标

- 建立 prompt section 级元数据模型，覆盖类型、来源、缓存策略、优先级和 token 估算。
- 将 prompt envelope 拆成稳定主 system prompt 与动态 supplemental messages，同时保留完整 section metadata。
- 支持覆盖 prompt、追加 prompt、用户上下文和动态运行时提醒的确定性合成顺序。
- 扩展 prompt inspection，默认展示治理信息，受保护模式可导出完整内容。
- 为 compact/memory/runtime reminder 等专项 prompt 提供统一构造入口，避免业务层散落拼接。

## 非目标

- 不引入外部 prompt 模板依赖。
- 不改变模型 provider API。
- 不做跨模型 prompt 内容大改写。
- 不实现真实 provider 级 prompt cache，只输出本地缓存语义供后续接入。

## 验收标准

- 单元测试覆盖 section metadata、优先级合成、专项 prompt 构造和 inspection 输出。
- smoke 测试覆盖 PRD-73 的核心路径：构建 prompt envelope 后可看到稳定/动态 section、缓存标记、来源说明和 token 估算。
- `pnpm build` 通过。
- `openspec status --change "prd-73-prompt-runtime-orchestration" --json` 显示完成。
- `openspec validate "prd-73-prompt-runtime-orchestration" --type change` 通过。

