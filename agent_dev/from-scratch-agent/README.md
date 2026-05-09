# from-scratch-agent

一个在 `agent_dev` 下从零实现的独立 Agent 项目。

## 约束

- 不依赖 `D:/项目/agent/typescript` 目录中的示例代码。
- 按 PRD 增量实现功能，并通过 OpenSpec 管理变更。

## 启动

1. 安装依赖
```bash
pnpm install
```

2. 配置环境变量（`.env`）
```bash
MODEL_ID=你的模型ID
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=可选
```

3. 本地运行
```bash
pnpm dev
```

4. 构建与运行
```bash
pnpm build
pnpm start
```

## Web

- 前端目录：`from-scratch-agent/web`
- 技术栈：`React + TypeScript + Tailwind`
- 启动方式：进入 `web` 目录后执行 `pnpm install && pnpm dev`

## 测试

- PRD-13 回归测试（配置层 + 状态守卫 + schemaVersion）
```bash
pnpm test:regression
```

- PRD-07 安全治理 smoke
```bash
pnpm exec tsx src/smoke/prd07-security-smoke.ts
```

- PRD-08 记忆检索 smoke
```bash
pnpm test:memory
```
