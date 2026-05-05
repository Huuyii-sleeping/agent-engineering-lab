## Overview

引入独立安全层，不改变现有工具业务实现。执行链路改为：
1) 解析工具名与参数
2) `PolicyEngine.evaluate(...)`
3) 依据决策执行 `allow` / `deny` / `require_approval`
4) 统一记录审计日志

## Components

### 1. PolicyEngine
- 策略来源：`.security/policy.json`
- 输出结构：
  - `decision: allow | deny | require_approval`
  - `risk: low | medium | high | critical`
  - `reason`
  - `matchedRule`
- 默认策略：
  - `bash` 命中高危关键词 => `require_approval` 或 `deny`
  - 文件路径越界/敏感目录写入 => `deny`
  - 常规读操作 => `allow`

### 2. ApprovalQueue
- 持久化：`.security/approvals.json`
- 字段：`request_id/action/risk/reason/scope/status/createdAt/expiresAt/consumedAt`
- 语义：
  - `approved` 请求仅允许消费一次
  - 过期后自动视为 `expired`

### 3. SecurityAudit
- 日志路径：`.audit/security_events.jsonl`
- 事件类型：
  - `policy_decision`
  - `approval_created`
  - `approval_decision`
  - `execution_blocked`
  - `execution_allowed`

### 4. Integration Points
- 主代理：`tools/index.ts -> runToolByName`
- 子代理：`tools/base.ts -> runBaseToolByName`
- 两处都接入同一 `securityGate(...)`，保证一致策略。

