## 1. Harness 基础模块

- [x] 1.1 新增 workspace fixture helper，支持临时目录、文件准备、环境覆盖、cwd 恢复和清理。
- [x] 1.2 新增 deterministic model helper，支持文本响应、tool call 响应、错误响应和请求记录。
- [x] 1.3 新增 scenario runner，支持结构化步骤、断言收集和失败报告。

## 2. 测试与脚本

- [x] 2.1 新增 harness 单元测试，先覆盖失败路径，再实现通过。
- [x] 2.2 新增 `test:harness` 脚本。

## 3. 验证与归档

- [x] 3.1 运行 targeted harness 测试。
- [x] 3.2 运行 `pnpm --dir apps/agent-cli test` 与 `pnpm build`。
- [x] 3.3 运行 OpenSpec status / validate 并归档提交。
