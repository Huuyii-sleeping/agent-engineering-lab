## 1. 工具与安全基线

- [x] 1.1 实现 `runBash(command)`，包含危险片段检查（`rm -rf /`、`sudo`、`shutdown`、`reboot`）
- [x] 1.2 增加 shell 执行超时（120s）与输出截断（50,000 字符）
- [x] 1.3 为危险命令拒绝和超时场景返回结构化工具错误

## 2. 核心 Agent 循环

- [x] 2.1 实现 `toAssistantMessage(message)`，保留历史所需的 tool call 数据
- [x] 2.2 实现 `agentLoop(messages)` 轮次逻辑（追加 assistant、执行工具、回填工具结果、继续迭代）
- [x] 2.3 确保响应无 `tool_calls` 时循环能正确结束

## 3. CLI 运行时

- [x] 3.1 实现 CLI 提示符 `s01 >>` 与输入循环
- [x] 3.2 增加 `q`、`exit`、空输入的退出处理
- [x] 3.3 将 CLI 请求接入 `agentLoop` 并输出 assistant 结果

## 4. 验收验证

- [x] 4.1 验证无工具调用轮次可正常结束（AC-00-1）
- [x] 4.2 验证有工具调用轮次可执行并回填工具结果消息（AC-00-2）
- [x] 4.3 验证危险命令会被拒绝且错误信息可读（AC-00-3）
- [x] 4.4 验证 CLI 多轮对话与退出命令可正常工作（AC-00-4）
