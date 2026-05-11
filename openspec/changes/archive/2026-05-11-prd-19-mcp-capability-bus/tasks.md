## 1. MCP Client + Registry

- [x] 1.1 新增最小 MCP stdio client，支持 server 启动、初始化、列工具、调工具与失败回收
- [x] 1.2 新增项目级 MCP 配置加载与外部工具注册表，生成模型可见工具定义

## 2. Unified Tool Routing

- [x] 2.1 改造统一 tool router，在 native / subagent / MCP 工具间分流
- [x] 2.2 为 MCP 工具接入安全门禁、结构化错误、观测与有限重试
- [x] 2.3 更新 CLI 与 HTTP service，使用统一动态工具清单暴露外部能力

## 3. Validation

- [x] 3.1 增加 MCP 单元测试，覆盖成功、失败和权限边界
- [x] 3.2 增加 PRD-19 smoke，覆盖同轮 native + MCP 调用
- [x] 3.3 运行构建、测试、smoke、OpenSpec validate，并修正回归问题
