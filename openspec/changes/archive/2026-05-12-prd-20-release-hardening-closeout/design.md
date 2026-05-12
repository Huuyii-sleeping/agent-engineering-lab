## Context

当前仓库的功能增量已经推进到 `PRD-19`，但“发布前最后一步”仍存在两个割裂点：

- `apps/agent-cli/package.json` 中虽然定义了多个 smoke / regression 脚本，但 `release:check` 只覆盖了其中一部分，导致仓库存在“实现已合入、统一门禁未覆盖”的空档。
- 多个正式归档的 spec 文件仍保留 `Purpose TBD` 占位文本。归档后的 spec 是长期维护基线，继续保留占位内容会降低规范可读性，也会让后续 change 缺少稳定参照。

这次变更横跨 `package.json` 与 `openspec/specs/`，但不引入新的运行时模块，也不改变 Agent 主循环行为，属于一次工程化收口。

## Goals / Non-Goals

**Goals:**

- 为 `apps/agent-cli` 提供更可信的统一发布检查入口，覆盖当前已实现且已存在脚本的关键 smoke / regression。
- 补写正式归档 spec 中遗留的 `Purpose` 占位内容，使其恢复为可读、可维护的基线文档。
- 让本轮收口变更可以通过 OpenSpec 规范化记录，而不是直接零散改脚本和文档。

**Non-Goals:**

- 不新增新的 smoke 测试用例。
- 不调整已有 PRD 的功能边界、需求含义或运行时实现。
- 不重构 `agent-cli` 的测试体系或脚本命名方式。

## Decisions

### 决策 1：用“补齐统一发布入口”替代“新建第二套检查脚本”

直接更新现有 `release:check`，把当前仓库已经存在且代表关键能力的 smoke / regression 都纳入其中。

选择原因：

- 现有仓库已经把 `release:check` 作为统一门禁名称，继续沿用最符合当前使用习惯。
- 用户、CI 和文档只需要记住一个入口，避免出现 `release:check` 与 `release:check:full` 之类的双轨命令。

备选方案：

- 新增 `release:check:full`
  - 不采用原因：会制造两个“看起来都像正式入口”的命令，后续更容易继续漂移。

### 决策 2：按“已实现且已有脚本”的原则纳入 smoke 覆盖

本次只把当前已经落地、且已经在 `package.json` 中存在脚本入口的后期能力检查纳入统一门禁，不额外发明新脚本或扩大测试面。

选择原因：

- 范围清晰，可在当前回合内收口。
- 能确保统一门禁反映仓库真实已交付能力，而不是引入尚未稳定的新验证项。

备选方案：

- 顺手补更多新测试或重排测试层次
  - 不采用原因：会把一次收口任务扩展成新的测试工程项目，超出本 PRD 范围。

### 决策 3：直接补写归档 spec 的 Purpose，而不是继续容忍占位文本

对已有 `openspec/specs/**/spec.md` 中的 `Purpose TBD` 直接替换为正式中文说明，保持每个 capability 的规格文件都可独立阅读。

选择原因：

- 这是最低成本、最高收益的收口方式，不改变 requirement，仅补全文档基线。
- 后续任何 change 在读取 capability spec 时都能立刻获得稳定上下文，不必再追溯归档 proposal。

备选方案：

- 保留 `TBD`，等待未来路过时顺手修改
  - 不采用原因：这会让文档债继续积压，没有明确完成点。

## Risks / Trade-offs

- [Risk] `release:check` 覆盖项变多后，本地执行时间会上升
  - Mitigation：本次仅纳入已经存在且必须代表已交付能力的脚本，不额外扩大范围。

- [Risk] 补写 `Purpose` 时可能误改 capability 含义
  - Mitigation：仅重写目的说明，不改 Requirement 与 Scenario 内容；所有表述以现有 spec 和归档 proposal 为依据。

- [Trade-off] 这次变更偏工程治理，用户可见收益不如新增功能直观
  - Benefit：能显著提高后续发布、回归和继续开发时的可信度。

## Migration Plan

1. 更新 `proposal/design/specs/tasks`，明确本次收口范围。
2. 修改 `apps/agent-cli/package.json` 中的统一发布检查脚本。
3. 批量补写正式归档 spec 的 `Purpose` 占位文本。
4. 运行与本次变更直接相关的检查，确认脚本和规格状态一致。
5. 完成后归档该 change。

回滚策略：

- 若统一发布检查过于耗时或引发不稳定，可回退 `release:check` 的新增覆盖项。
- `Purpose` 文本回退风险很低；如发现语义不准，可按 capability 单独修正。

## Open Questions

- 当前无阻塞性开放问题；后续若要把 Web 端、根目录工作区或跨包验证并入统一发布门禁，应在独立 change 中讨论。
