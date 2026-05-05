## Overview

本次变更聚焦“稳定性底座”，在不引入新业务域的前提下，提升系统一致性与可维护性。设计分四块：统一配置、状态机守卫、schema 演进、回归验证。

## 1) Runtime Config

- 新增 `runtime-config.ts` 作为统一常量入口。
- 通过环境变量覆盖默认值，未配置时回退安全默认值。
- 首批接入模块：
  - `bash`（timeout/max output）
  - `file-tools`（default read limit）
  - `context-compact`（threshold/keep recent）
  - `background-task`（max output）
  - `autonomy`（poll/idle timeout）
  - `subagent`（max rounds/default wait/max tokens）

## 2) State Guards + Error Codes

- 对任务状态增加显式状态转移限制，禁止明显非法跳转（例如 `completed -> pending`）。
- claim completed task 返回结构化错误码而非静默覆盖。
- 保持错误输出结构统一：`{ ok:false, error:{ code, message } }`。

## 3) Schema Version Evolution

- 在 `task/team/worktree` 记录中补充 `schemaVersion`。
- 读取时兼容旧版本：字段缺失时自动回退默认值，不阻断运行。
- 写回时统一写入当前版本号，逐步完成存量数据“懒迁移”。

## 4) Regression Entry

- 增加一键回归脚本（本地 smoke + 关键失败路径）。
- 将回归入口纳入 README，作为发布前默认检查步骤。

## Compatibility

- 工具入参保持不变，避免破坏已有模型工具调用契约。
- 持久化文件采用向后兼容读取，避免升级后读取旧数据失败。
