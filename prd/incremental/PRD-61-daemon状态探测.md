# PRD-61 daemon 状态探测

## 背景

`PRD-60` 已经让 `agent-cli daemon` 成为真实后台宿主，但前台入口还没有“判断 daemon 是否存在”的最小控制面。

## 目标

- 提供 `agent-cli daemon status`。
- 让前台入口和脚本能快速判断 daemon 是否在运行。
- 保持这一步只做探测，不扩展到 attach / stop / restart。

## 方案

- 在 daemon lock 旁边增加只读 status API。
- `daemon status` 基于 lock 状态输出：
  - `running`
  - `not_running`
  - `stale`
- 退出码：
  - `0`：running
  - `1`：not_running / stale

## 验收标准

- `agent-cli daemon status` 可以稳定执行。
- 运行中的 daemon 会输出 `running` 并返回 `0`。
- 不存在 daemon 或仅存在陈旧锁时，会输出明确状态并返回非零退出码。
- focused tests、build、OpenSpec strict 通过。
