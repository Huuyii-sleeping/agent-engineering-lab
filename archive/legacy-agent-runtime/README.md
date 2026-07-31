# Legacy Agent Runtime Archive

> **FROZEN · READ-ONLY · NON-PRODUCTION**

本目录保存 Mastra 迁移前自研教学版 Agent Runtime 的历史源码，仅用于架构演进回顾、教学和代码考古。

## 归档状态

- **Frozen**：不继续开发、不修复缺陷、不升级依赖。
- **Read-only**：除补充归档说明或修复历史文件损坏外，不修改归档源码。
- **Non-production**：不是备用 Runtime、兼容层、fallback 或 rollback 执行路径。

归档基线来自 Git commit：

```text
66d81394ced91ff3b2878f569b4cdd95d6f557da
```

原目录结构保存在：

```text
archive/legacy-agent-runtime/apps/agent-cli/src/**
```

## 强制隔离规则

本目录不得：

- 加入 `pnpm-workspace.yaml`；
- 加入任何生产 `tsconfig`、路径映射或编译 include；
- 出现在 package exports、启动脚本、构建脚本或测试流程中；
- 被 `apps/agent-cli`、NestJS、RuntimeGateway、Mastra Adapter 或其他 workspace package import、require、动态加载或执行；
- 被用于恢复 legacy backend、selector、自研 Agent loop 或 Workflow scheduler。

归档刻意不提供 `package.json`、`tsconfig.json`、exports、构建命令和测试入口，因此不应尝试在仓库中直接运行。

## 当前生产路径

当前唯一生产运行路径为：

```text
NestJS Host
→ RuntimeGateway
→ Agent / Workflow / Tool / Memory Ports
→ Mastra Adapters
→ Shared Mastra Instance
```

如需重新使用归档中的任何设计，必须通过新的 OpenSpec 重新设计和实现，不能直接连接现有生产路径。
