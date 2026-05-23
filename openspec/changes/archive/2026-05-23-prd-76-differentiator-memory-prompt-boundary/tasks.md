## 1. Prompt 边界实现

- [x] 1.1 在 `prompt/sections.ts` 中新增 agent memory index 行数/字符截断 helper。
- [x] 1.2 将 `agentMemory.currentIndex` 注入路径改为使用截断结果，并在截断时追加说明。

## 2. 测试与验证

- [x] 2.1 更新 prompt builder 单元测试，覆盖长 index 截断和短 index 不截断。
- [x] 2.2 新增 PRD-76 smoke 测试，覆盖超长 agent memory index 不完整进入 primary system prompt。
- [x] 2.3 运行 OpenSpec validate、定向测试、PRD-76 smoke 和 `pnpm build`。
