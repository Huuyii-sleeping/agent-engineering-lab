# PRD-68 Sandbox 执行隔离与权限联动

## 背景

Claude Code 的 sandbox 实现不是单一的“运行命令时套一层容器”，而是由 Bash 路由、settings/permissions 转换、权限自动放行、执行后清理和 doctor/status 可见性共同组成的安全执行链。当前仓库已经具备基础 Bash 工具、安全策略、审批、权限模式、环境变量 scrub 和裸仓库清理，但缺少一个显式、可配置、可观测的 sandbox 执行姿态。

本 PRD 目标是在现有安全治理基础上补齐本地 Bash sandbox 控制面，使 shell 执行默认处于可解释的隔离模式，并把 sandbox 与权限模式、审计和 doctor 串起来。

## 目标

- 为 Bash 工具建立明确的 sandbox mode，而不是把安全行为散落在危险命令检查、环境变量清理和审批规则中。
- 将 sandbox mode 暴露给 `/status`、`/config`、`/doctor` 等本地控制面，便于用户确认当前执行姿态。
- 让 sandbox 与现有 permission mode、security policy、approval flow 保持同一条执行链。
- 对执行后清理给出结构化结果，确保临时裸仓库等高风险副作用可见、可测试。

## 范围（In Scope）

- Bash sandbox 配置：
  - 支持 `AGENT_BASH_SANDBOX_MODE`。
  - 支持模式：`off`、`workspace-write`、`strict-readonly`。
  - 默认使用 `workspace-write`。
- Bash 执行隔离：
  - 继续 scrub 高风险继承环境变量。
  - `strict-readonly` 下拒绝明显写入型 shell 命令。
  - `workspace-write` 下允许工作区内执行，但保留策略审批和执行后清理。
- 权限联动：
  - `plan` 模式继续阻断 `bash`。
  - security policy 仍在 Bash 执行前生效。
  - sandbox 不能绕开 approval flow。
- 可观测与诊断：
  - `/status`、`/config` 或 `/doctor` 至少一个控制面展示当前 sandbox mode。
  - Bash 输出在发生清理时包含可读清理摘要。
- 测试：
  - 单元测试覆盖 sandbox mode 解析、readonly 阻断、环境 scrub、清理摘要。
  - smoke 测试覆盖安全策略与 sandbox 不互相绕过。

## 非目标（Out of Scope）

- 不实现 OS 级容器、chroot、Windows Job Object、macOS Seatbelt 或 Linux namespace。
- 不实现网络隔离、防火墙或进程级资源配额。
- 不引入跨平台完整虚拟化沙箱。
- 不改变 MCP sandbox 语义；MCP 仍通过现有 trust、approval、registry 生命周期控制。
- 不修改 OpenSpec / Superpowers 工作流规则。

## 功能要求

### FR-68-1 Sandbox mode 配置

系统必须从环境变量读取 Bash sandbox mode，并对非法值回退到 `workspace-write`。

支持值：
- `off`：只保留现有安全策略和审批，不额外执行 sandbox readonly 规则。
- `workspace-write`：默认模式，允许工作区内 Bash 执行，保留环境 scrub、审批、危险命令拦截和执行后清理。
- `strict-readonly`：拒绝明显写入型 shell 命令，用于规划、审查、只读排查。

### FR-68-2 Bash 执行前隔离判断

系统必须在真正执行 shell 前完成以下判断：

1. permission mode 检查；
2. security policy / approval 检查；
3. Bash sandbox mode 检查；
4. dangerous snippet 快速拒绝；
5. 环境变量 scrub。

任何阻断都必须返回结构化错误，不能静默跳过。

### FR-68-3 执行后清理

系统必须在 Bash 执行结束后扫描本轮新增的裸仓库候选目录，并进行清理。清理结果必须可以被测试和在输出中被用户看到。

### FR-68-4 控制面可见性

系统必须在本地控制面展示当前 sandbox mode，使用户能确认当前 Bash 执行姿态。推荐位置：

- `/status`：运行态摘要；
- `/config`：配置来源；
- `/doctor`：诊断项。

### FR-68-5 与现有安全链路兼容

sandbox 不得替代 security policy、permission mode 或 approval flow。它只能作为额外约束层加入执行链。

## 验收标准（AC）

- AC-68-1：默认情况下 `/status`、`/config` 或 `/doctor` 能显示 `workspace-write` sandbox mode。
- AC-68-2：设置 `AGENT_BASH_SANDBOX_MODE=strict-readonly` 后，明显写入型 Bash 命令被结构化拒绝。
- AC-68-3：`plan` permission mode 下，`bash` 仍在 sandbox 之前被阻断。
- AC-68-4：高危 Bash 命令仍由 security policy 返回 `SECURITY_POLICY_DENY` 或 `SECURITY_APPROVAL_REQUIRED`，不会因为 sandbox mode 被绕过。
- AC-68-5：Bash 执行后新增裸仓库候选目录会被清理，输出包含清理摘要。
- AC-68-6：非法 sandbox mode 环境值回退到 `workspace-write`，doctor 或 config 能给出可理解状态。

## 实施顺序

1. 先实现 sandbox mode 配置解析与类型。
2. 再把 sandbox mode 接入 Bash 执行前判断。
3. 补充 readonly 阻断规则与结构化错误。
4. 把 sandbox mode 暴露到 CLI status/config/doctor。
5. 补充单元测试和 PRD smoke 测试。
6. 运行 OpenSpec validate、定向测试、全量 agent-cli test/build 后提交。

## 来源参考

- `claude-code-analysis/analysis/04e-sandbox-implementation.md`
- 本仓库 `PRD-07 安全治理与权限边界`
- 本仓库现有 Bash、安全策略、权限模式和 doctor 实现
