## Context

当前 daemon 已经具备：

- 长期 `AgentHost`
- session persistence
- 单实例锁与陈旧锁回收

但外部控制面还没有探测入口。前台 CLI 如果想知道“daemon 是否已在运行”，只能尝试启动后依赖错误，或者直接去读锁文件。这不利于后续 attach / reuse，也不利于脚本化集成。

## Goals

- 提供稳定的 daemon 存在性探测面。
- 让 CLI 可以通过 `daemon status` 直接读取 daemon 当前状态。
- 把探测逻辑沉到可复用的 lock/status API，而不是只写在 CLI 分支里。

## Non-Goals

- 不做 attach、stop、restart。
- 不新增 daemon HTTP 管理接口。
- 不修改现有 `daemon` 启动流程语义。

## Decisions

### Decision 1: 探测第一阶段基于 lock file，而不是直接依赖 HTTP ping

选择基于 `.runtime/daemon.lock` 的只读状态探测，区分：

- `running`
- `not_running`
- `stale`

原因：

- 现有 daemon 单实例语义已经由 lock file 定义。
- 这是最接近“后台宿主是否存在”的本地真相源。
- 后续即使增加 attach / HTTP probe，lock status 仍可作为前置快速探测。

不选 HTTP ping 的原因：

- 依赖端口和网络面，不适合作为第一层存在性判断。
- daemon 未来可能出现“进程存在但 HTTP 尚未 ready”的短时状态，仅靠 ping 语义不稳定。

### Decision 2: CLI 先提供 `agent-cli daemon status`，并保留退出码语义

输出面先做成命令子操作：

- `agent-cli daemon`：继续表示启动 daemon
- `agent-cli daemon status`：显示当前状态

同时提供可脚本化退出码：

- `0`：running
- `1`：not_running 或 stale

原因：

- 不破坏现有 `daemon` 启动命令。
- 后续扩展 `daemon attach`、`daemon stop` 时，CLI 结构仍然自然。
- 退出码让 shell 和自动化脚本可以直接使用。

### Decision 3: daemon status 文案保持紧凑，但包含足够的诊断信息

状态输出保持单行、人类可读：

- running：带 `pid` / `cwd`
- stale：明确说明是陈旧锁
- not_running：直接说明未运行

原因：

- 这是一层控制面探针，不需要复杂格式。
- 只要能帮助人判断状态，并给脚本提供退出码，就足够支撑下一步 attach / reuse。

## Risks / Trade-offs

- [Risk] lock file 存在但 daemon 实际启动失败，状态可能短时误判为 running
  - Mitigation：第一阶段接受这种短窗口；后续 attach 阶段再补 HTTP ready probe

- [Risk] stale 状态是否应该自动清理，容易引发语义争议
  - Mitigation：`status` 保持只读，不自动删除；真正清理仍由 `acquire()` 负责

## Implementation Plan

1. 新增 `PRD-61` 文档、proposal / design / delta spec。
2. 为 `DaemonLock` 增加状态探测 API。
3. 新增 `daemon status` CLI 分支和 renderer。
4. 补齐 focused tests。
5. 运行 build、OpenSpec strict 和差异检查。
