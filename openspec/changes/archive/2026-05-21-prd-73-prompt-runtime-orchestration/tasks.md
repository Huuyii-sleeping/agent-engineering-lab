## 1. Prompt section 元数据模型

- [x] 1.1 扩展 `prompt/types.ts`，为 section/envelope 增加 kind、source、cachePolicy、priority、inclusionReason 和 estimatedTokens。
- [x] 1.2 更新 `prompt/sections.ts` 的 stable section 构造逻辑，保留现有输出顺序并补齐 metadata。
- [x] 1.3 增加 override prompt 与 append prompt 输入，验证稳定 prompt 合成优先级。

## 2. 动态与专项 prompt 构造

- [x] 2.1 增加 user context、memory context、compact summary 和 runtime reminder 的共享 section helper。
- [x] 2.2 更新 `buildPromptEnvelope`，使动态来源统一通过 section helper 进入 supplemental system messages。
- [x] 2.3 更新模型请求相关测试，验证 stable prompt 与 supplemental messages 的边界不回退。

## 3. Inspection 与 CLI 可见性

- [x] 3.1 扩展 `inspectPromptSource` 输出 section governance metadata。
- [x] 3.2 更新 CLI prompt dump 渲染，展示 metadata 摘要且默认不泄露动态正文。
- [x] 3.3 保持 protected export 行为兼容，并覆盖新增 metadata 的导出测试。

## 4. 验证

- [x] 4.1 新增或更新 prompt 单元测试，覆盖 metadata、优先级和专项 section。
- [x] 4.2 新增 PRD-73 smoke 测试，覆盖 prompt envelope 与 inspection 核心路径。
- [x] 4.3 运行 OpenSpec validate、定向测试、`pnpm build` 和对应 smoke 测试。
