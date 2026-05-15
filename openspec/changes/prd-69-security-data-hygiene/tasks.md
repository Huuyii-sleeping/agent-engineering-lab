## 1. 共享 hygiene 与 approval scope 收口

- [ ] 1.1 新增共享 security data hygiene 模块，支持文本脱敏、隐藏字符清洗和稳定 scope hash
- [ ] 1.2 调整 `security-manager` / approval store，落盘 redacted scope preview，并以 hash 作为主匹配键兼容旧记录
- [ ] 1.3 强化 `bash` 安全策略与执行环境，覆盖高危 pattern 审批、Git 相关环境清理和 bare repo scrub

## 2. sink 接入

- [ ] 2.1 将 hygiene 接入 memory 持久化与 observability / audit 落盘
- [ ] 2.2 将 hygiene 接入 MCP 工具描述与输出归一化
- [ ] 2.3 收敛 observability 中 MCP 标识的隐私暴露

## 3. 验证与清理

- [ ] 3.1 补充 security / bash / mcp / observability focused tests，并扩展 memory / observability smoke
- [ ] 3.2 删除 `docs/learning/claude-code/` 并清理根 README 中仍在引用该目录的入口
- [ ] 3.3 更新 spec / tasks 状态并完成 strict 校验
