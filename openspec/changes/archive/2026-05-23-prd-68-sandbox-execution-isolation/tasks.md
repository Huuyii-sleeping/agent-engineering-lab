## 1. 配置与 Bash sandbox 核心

- [x] 1.1 在 `runtime-config.ts` 中新增 `BashSandboxMode` 与 `bashSandboxMode` 配置解析，默认 `workspace-write`。
- [x] 1.2 在 `tools/bash.ts` 中新增 readonly 阻断判断与 `SANDBOX_READONLY_VIOLATION` 结构化错误。
- [x] 1.3 保持现有危险命令拒绝、环境 scrub、超时、输出截断和裸仓库清理行为不退化。

## 2. CLI 控制面可见性

- [x] 2.1 在 CLI status/config snapshot 中加入 `bashSandboxMode`。
- [x] 2.2 更新 status/config 渲染，让 `/status` 与 `/config` 输出当前 sandbox mode。
- [x] 2.3 在 doctor 中增加 Bash sandbox 检查项，说明当前姿态。

## 3. 测试与验证

- [x] 3.1 更新 Bash 单元测试，覆盖默认模式、非法值回退、strict-readonly 阻断和只读命令放行。
- [x] 3.2 更新 CLI UI/doctor 测试，覆盖 sandbox mode 展示。
- [x] 3.3 新增或更新 smoke 测试，验证 plan permission 与 security policy 不被 sandbox 绕过。
- [x] 3.4 运行 OpenSpec validate、定向测试、`pnpm.cmd --filter agent-cli test` 和 `pnpm.cmd --filter agent-cli build`。
