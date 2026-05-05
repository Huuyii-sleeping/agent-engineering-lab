# from-scratch-agent

一个在 `agent_dev` 下从零实现的独立 Agent 项目。

## 约束

- 不依赖 `D:/项目/agent/typescript` 目录中的示例代码。
- 按 PRD 增量实现功能，并通过 OpenSpec 管理变更。

## 启动

1. 安装依赖
```bash
npm install
```

2. 配置环境变量（`.env`）
```bash
MODEL_ID=你的模型ID
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=可选
```

3. 本地运行
```bash
npm run dev
```

4. 构建与运行
```bash
npm run build
npm run start
```

## 测试

- PRD-13 回归测试（配置层 + 状态守卫 + schemaVersion）
```bash
npm run test:regression
```

- PRD-07 安全治理 smoke
```bash
npx tsx src/smoke/prd07-security-smoke.ts
```

