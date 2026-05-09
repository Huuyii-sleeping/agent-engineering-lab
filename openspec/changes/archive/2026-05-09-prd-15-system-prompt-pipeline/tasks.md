## 1. Prompt 模块骨架

- [x] 1.1 新增 prompt types / builder / section 模块，定义统一的 prompt 组装结果结构
- [x] 1.2 将当前基础 system prompt 从 `config.ts` 下沉为 core section 来源

## 2. 主循环接入

- [x] 2.1 将 memory、notifications、hooks 等现有 system 输入来源整理为 builder 输入
- [x] 2.2 改造 `agent-loop.ts`，统一通过 prompt pipeline 构建模型请求的 system 输入

## 3. 验证与回归

- [x] 3.1 为 prompt builder 和 section 顺序补充单元测试
- [x] 3.2 运行构建与相关 smoke / regression 验证，并修正回归问题
