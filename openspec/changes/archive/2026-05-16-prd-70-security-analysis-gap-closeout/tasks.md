## 1. 差距基线与统一治理

- [x] 1.1 整理当前 `.sessions`、`.transcripts`、`.memory`、`.observability`、`.security`、`.audit` 的持久化入口、读取入口与现有生命周期行为
- [x] 1.2 定义统一 retention class、默认保留策略、cleanup 触发方式与审计格式
- [x] 1.3 为 session、transcript、prompt dump、memory、observability 建立共享的显式导出/删除 contract

## 2. 本地持久化高敏感面收口

- [x] 2.1 为 session persistence 增加敏感历史与 runtime state 的受保护存储或脱敏落盘逻辑
- [x] 2.2 为 context compact transcript snapshot 增加脱敏、生命周期元数据与统一清理接入
- [x] 2.3 为 prompt dump / inspection surface 增加默认最小暴露模式与受保护导出路径
- [x] 2.4 为 memory store 增加 retention、过期清理与显式删除支持

## 3. 文件路径与写入边界加固

- [x] 3.1 将文件工具边界校验从 `path.resolve` 升级为 `realpath` / symlink-safe 校验
- [x] 3.2 引入敏感路径 denylist、受管写入策略与更高等级审批边界
- [x] 3.3 为路径提升、越界重定向和工作区逃逸场景补齐单测与回归测试

## 4. MCP 信任与来源治理

- [x] 4.1 为 MCP server / capability 暴露 provenance 摘要、来源身份与 trust policy 入口
- [x] 4.2 为未受信任的 MCP server 或 remote capability 增加默认阻断或显式信任流程
- [x] 4.3 收紧 MCP 认证材料、连接元数据与高敏感配置在日志、事件和工具结果中的暴露边界

## 5. Secret Scanning 与 DLP 防线

- [x] 5.1 在工具输出进入会话前增加高置信 secret-like 扫描与阻断/降级动作
- [x] 5.2 在 workspace 写副作用后增加文件级 secret scanning，并把发现结果接入 observability / audit
- [x] 5.3 在 delivery validation 或提交前校验阶段汇总未解决的 secret findings，并阻止被误判为正常完成
- [x] 5.4 为 block / warn / audit-only 三类动作补齐测试矩阵与样例

## 6. 保留缺口与后续拆分

- [x] 6.1 为系统级 sandbox 能力单独整理前置约束，形成后续 PRD 输入
- [x] 6.2 为云 telemetry 隐私分层、essential-only 模式和组织级关闭开关整理后续 PRD 输入
- [x] 6.3 为远端 Team Memory / shared memory sync 的身份、隔离、加密与删除模型整理后续 PRD 输入
- [x] 6.4 在本 PRD 中维护“已补齐 / 待实现 / 保留缺口”状态表，确保后续不再重复人工补漏
