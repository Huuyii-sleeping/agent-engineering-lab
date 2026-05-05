## 1. Artifacts

- [x] 1.1 完成 proposal（明确工具执行与通知目标）
- [x] 1.2 完成 design（定义 base registry + 子代理执行循环 + 通知队列）
- [x] 1.3 完成 specs（新增 subagent-tool-execution，修改 subagent-collaboration）

## 2. Implementation

- [x] 2.1 抽离基础工具注册中心，供主代理与子代理复用
- [x] 2.2 子代理执行改为工具调用循环并回填结果
- [x] 2.3 增加子代理完成/失败通知队列与 drain API
- [x] 2.4 主循环注入完成通知摘要

## 3. Validation

- [x] 3.1 构建通过
- [x] 3.2 验证子代理可实际创建文件
- [x] 3.3 验证主代理后续轮次收到完成通知
