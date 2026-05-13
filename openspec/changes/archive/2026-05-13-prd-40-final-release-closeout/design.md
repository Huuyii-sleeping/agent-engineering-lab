## Context

当前仓库已经完成边界收口主线，最新状态包括：

- PRD-39 已归档。
- OpenSpec active changes 为空。
- 学习沉淀只保留 `docs/learning/claude-code/operations/`。
- 根 `release:check` 已指向 `agent-cli` 的统一发布检查。

但仍有几个发布前一致性问题需要收尾：

- 根 README 对 `operations/` 文档入口没有说明。
- `apps/agent-cli/README.md` 存在历史 Windows 绝对路径链接。
- `prd/incremental/README.md` 仍主要描述 PRD-00 到 PRD-19 的早期路线，没有说明 PRD-21 到 PRD-40 的生产级架构收口阶段。
- 当前交接文档需要记录 PRD-40 最终 release closeout 的验证结果。

## Goals / Non-Goals

**Goals:**

- 同步文档入口和当前仓库状态。
- 执行统一发布检查。
- 保持 OpenSpec change 生命周期完整：proposal/design/spec/tasks -> validate -> archive。
- 本地 commit，不 push。

**Non-Goals:**

- 不新增代码能力。
- 不修改 smoke 测试语义。
- 不扩大 release check 范围，除非发现脚本缺口。

## Decisions

### Decision 1: 本轮只做最终收口，不继续拆边界

采纳：

- 文档一致性、统一发布检查和 OpenSpec 归档作为本轮唯一范围。

原因：

- PRD-39 后继续拆小文件收益低，发布前更重要的是状态可信和验证证据完整。

### Decision 2: operations 作为唯一学习沉淀主入口

采纳：

- README 和交接文档只指向 `operations/`。

原因：

- 用户已经明确不需要 `01-26` 流水账文档，后续学习沉淀应服务于讲清楚项目，而不是记录每轮改动。

### Decision 3: release check 作为最终验证主命令

采纳：

- 运行根目录 `pnpm release:check`，再补 OpenSpec strict 和 diff check。

原因：

- release spec 已经定义统一发布检查入口；最终 closeout 必须以这个入口为准。

## Risks / Trade-offs

- [Risk] `release:check` 耗时较长 -> Mitigation：最终 closeout 接受较长验证成本。
- [Risk] smoke 脚本产生运行产物 -> Mitigation：验证后检查并清理运行产物。
- [Risk] 文档仍有过期引用 -> Mitigation：使用 `rg` 检查已删除 learning 文档和历史绝对路径引用。
