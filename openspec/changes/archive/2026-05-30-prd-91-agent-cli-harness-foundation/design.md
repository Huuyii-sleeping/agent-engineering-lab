## Context

当前仓库已有大量 PRD smoke、unit test 和 release check，但测试基建存在重复模式：临时 workspace 创建、文件写入、环境变量恢复、假模型响应、故障注入和输出断言散落在不同测试文件中。后续要降低 TUI、scheduler、multi-agent、session resume 等能力的人工验证成本，需要先收敛 test-only harness 基础层。

## Goals / Non-Goals

**Goals:**

- 提供可复用 workspace fixture，自动处理临时目录、文件写入、`process.cwd()` 切换与环境恢复。
- 提供 deterministic model harness，支持按序返回文本、tool calls 或抛错。
- 提供 scenario runner，支持结构化步骤执行与断言收集。
- 保持 test-only，不影响 production runtime。

**Non-Goals:**

- 不引入 PTY 依赖，不实现真实终端按键驱动。
- 不重写现有 smoke，只提供后续迁移基础。
- 不改变 delivery、query runtime、scheduler 或 TUI 的生产逻辑。

## Decisions

1. Harness 放在 `apps/agent-cli/test/harness/`，而不是 `src/`。
   - 理由：这是测试基础设施，不应进入 runtime 包边界。
   - 备选：放入 `src/testing`。不采用，因为会把测试 API 暴露给生产构建。

2. Scenario runner 先保持轻量函数式 API。
   - 理由：当前需求是统一测试模式，不需要 DSL 解释器或独立 CLI。
   - 备选：直接引入 YAML/JSON 场景文件。暂不采用，避免本轮增加解析和 schema 维护成本。

3. Deterministic model 使用脚本队列。
   - 理由：可稳定模拟多轮 assistant、tool call、error，不依赖真实 OpenAI。
   - 备选：在每个测试里直接写 mock。重复度高，且难以形成跨场景约定。

## Risks / Trade-offs

- [Risk] Harness API 过早抽象后续不合适。
  → Mitigation: 本轮只提供小型 composable helpers，避免复杂 DSL。

- [Risk] 与现有 smoke 重复。
  → Mitigation: 本轮不迁移所有 smoke，只新增自测和脚本入口。

- [Risk] Test-only 文件误入生产引用。
  → Mitigation: 仅放在 `test/` 目录，由 unit tests 引用。
