## Context

当前安全实现已经覆盖了三类基础能力：

- `security-policy` + `security-manager` 负责审批门禁和本地审计
- `file-tools` 负责路径边界
- `mcp`、`memory`、`observability` 已经分别具备统一接入、持久化和事件落盘
- `bash` 已具备基础危险片段拒绝和超时控制

但当前仍存在三个真实缺口：

1. `.security/approvals.json` 的 `scope` 直接保存原始参数 JSON，敏感值会落盘
2. `.memory`、`.observability`、`.audit` 对 secret-like 字符串没有统一脱敏
3. MCP description / output 对 bidi / hidden control chars 没有统一清洗
4. `bash` 执行仍然继承宿主 Git 相关环境，也没有执行后的 bare repo scrub
5. 高危解释器 / shell / remote-exec 形态没有统一进入显式审批边界

这几个问题都是跨模块的 sink hygiene 问题，继续在各模块局部补 if/regex 会让规则漂移，因此需要一层共享实现。

## Goals / Non-Goals

**Goals:**

- 提供一套共享的文本清洗与敏感值脱敏工具
- 让 approval / audit 持久化不再依赖原始 scope 文本做匹配
- 让 memory、observability、MCP 统一复用同一套 hygiene 规则
- 让 bash 执行链路对高危模式、Git 继承环境和 bare repo 植入有明确收口
- 保持现有审批、工具调用和 observability 主语义不回退
- 删除不再维护的学习沉淀目录，并清理仍在引用该目录的 README 入口

**Non-Goals:**

- 不引入外部 secret scanning 服务或依赖
- 不承诺覆盖所有 secret 格式
- 不重做 security policy 状态机
- 不引入系统级 sandbox 或 namespace 隔离
- 不修改 handoff 文档历史内容

## Decisions

### 1. 用共享 hygiene 模块统一做脱敏与清洗，而不是在各 sink 自己写正则

决策：

- 新增共享 hygiene 模块，负责：
  - secret-like text redaction
  - hidden control / bidi character sanitization
  - 稳定 scope hash 生成
  - JSON-like payload 的递归清洗

原因：

- 这轮是典型 cross-cutting concern；规则散落到 memory / observability / security / MCP 会很快漂移。

备选方案：

- 分别在四个模块里手写最小逻辑
- 不采用原因：测试会分叉，后续补规则时容易漏 sink

### 2. 审批匹配改为 `scope hash`，展示与落盘只保留 redacted preview

决策：

- `PolicyDecision` / `ApprovalRequest` 增加稳定 scope hash
- `scope` 字段改为 redacted preview
- `consumeApproval()` 优先按 hash 匹配，兼容旧格式时再回退 legacy scope 文本

原因：

- 当前 `scope` 同时承担“用户可读展示”和“精确匹配键”两个职责，导致只能把原始参数写入磁盘。

备选方案：

- 继续保存原始 scope，再额外写一个 preview
- 不采用原因：泄露面仍存在，只是换了个字段名

### 3. 在 sink 边界接入 hygiene，而不是在 query loop 中央统一改写所有消息

决策：

- 在以下落点做接入：
  - security approval / audit
  - memory store add
  - observability recordEvent
  - MCP tool list / output normalize

原因：

- 这轮目标是保护“落盘”和“外部文本 ingress”，不是改写整个对话消息流。

备选方案：

- 在 query runtime 的统一消息层做全局改写
- 不采用原因：范围过大，且会改变已有 prompt / transcript 语义

### 4. `bash` 高危模式走显式审批，基础子进程环境在执行前做最小清理

决策：

- 为 `bash` 增加高危 pattern 集合，覆盖解释器、二级 shell、`eval/exec/env/xargs`、远程执行等前缀
- 这些 pattern 默认进入 `require_approval`
- 执行前清理高风险继承环境，例如 Git worktree / object / config 指针和 shell startup 注入变量

原因：

- 仅靠 `rm -rf /`、`sudo` 这种片段黑名单远远不够，`python -c`、`bash -lc`、`ssh host cmd` 本身就是“任意能力转义器”。

备选方案：

- 在 `bash.ts` 里继续追加 deny snippet
- 不采用原因：很难覆盖解释器类高危模式，而且会把审批逻辑和执行逻辑继续耦合

### 5. 对新植入的 bare Git repo 做执行后 scrub，而不是只做静态 deny

决策：

- `bash` 执行前后对工作区做轻量候选扫描
- 对本次命令新引入的 bare repo 目录（例如含 `HEAD`、`objects/`、`refs/` 且不是正常 `.git` 目录）执行 scrub
- 在命令输出中附带安全提示

原因：

- 这是最接近 02 文档里 Git 逃逸防御思路、且能在当前仓库内落地的本地防线。

备选方案：

- 完全不处理 bare repo，只依赖用户自己审计
- 不采用原因：已知攻击链会利用“沙盒内植入，宿主机外触发”的时间差

### 4. 学习沉淀目录直接删除，只清理当前活文档入口

决策：

- 删除 `docs/learning/claude-code/`
- 仅清理根 `README.md` 中仍指向该目录的入口
- 保留 `docs/当前对话交接-*.md` 等历史交接文档，不做大规模内容改写

原因：

- 用户已经明确不再维护该目录；交接文档属于历史记录，不应顺手重写。

备选方案：

- 保留目录但停止更新
- 不采用原因：会继续制造“看起来还在维护”的误导

## Risks / Trade-offs

- [Risk] 脱敏规则覆盖不全，仍可能漏掉某些私有 token 形态。
  → Mitigation：先覆盖高频 secret-like 格式和 key/value 形态，后续按真实案例增量补规则。

- [Risk] 过度脱敏会降低 memory / observability 的可读性。
  → Mitigation：保留 redacted preview，不直接删除整段内容。

- [Risk] Unicode 清洗可能改变部分外部文本展示。
  → Mitigation：只清理 hidden control / bidi 字符，保留普通可见 Unicode 文本。

- [Risk] 老的审批记录在升级后可能无法消费。
  → Mitigation：`consumeApproval()` 保留 legacy scope 回退匹配，保证兼容旧记录。

- [Risk] bare repo scrub 可能误删用户本次确实想创建的裸仓库。
  → Mitigation：只 scrub “本次命令新增”的候选目录，并在输出里明确提示发生了清理。

- [Risk] bash 高危 pattern 过宽会增加审批噪音。
  → Mitigation：先覆盖解释器 / shell / 远程执行等高杠杆模式，后续按真实使用反馈调窄。

## Migration Plan

1. 引入共享 hygiene 模块并补单测
2. 调整 approval types / store / manager，增加 hash 与 legacy fallback
3. 强化 bash policy / env / scrub
4. 逐个接入 memory、observability、MCP
5. 扩展 smoke 覆盖持久化脱敏、MCP 清洗与 bash hardening
6. 删除学习沉淀目录并清理根 README 入口

## Open Questions

- 本轮不引入可配置的自定义 redaction rule；先固定内建规则，后续按使用反馈决定是否开放配置。
