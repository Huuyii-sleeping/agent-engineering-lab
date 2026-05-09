## 1. Artifacts

- [x] 1.1 proposal/design/specs 完成

## 2. Implementation

- [x] 2.1 新增 `.codex/hooks.json` 配置读取、Hook 类型、结果结构与 HookRunner
- [x] 2.2 在主循环接入 `SessionStart / UserPromptSubmit / Stop`
- [x] 2.3 在工具执行链接入 `PreToolUse / PostToolUse`
- [x] 2.4 实现命令型 hook 的 JSON stdin/stdout 协议与 tool matcher
- [x] 2.5 迁移至少一类现有横切逻辑到 hook 机制作为示例
- [x] 2.6 增加 PRD-14 smoke 或回归验证

## 3. Validation

- [x] 3.1 `npm run build` 通过
- [x] 3.2 对应 smoke/回归测试通过
- [x] 3.3 `openspec status/validate` 通过
