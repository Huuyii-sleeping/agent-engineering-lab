# AGENT.md

## Package Manager

- 本项目统一使用 `pnpm`
- 不再使用 `npm install`、`npm run`、`npx`
- 安装依赖使用 `pnpm install`
- 运行脚本使用 `pnpm <script>`，例如 `pnpm dev`、`pnpm build`、`pnpm test:regression`
- 执行本地二进制使用 `pnpm exec <command>`

## Web

- web 前端目录为 `from-scratch-agent/web`
- web 技术栈为 `React + TypeScript + Tailwind`
- web 开发启动命令为 `pnpm install && pnpm dev`

## Current Scope

- 当前 web 端通过只读 API 展示 `.tasks`、`.runtime/todos.json`、`.observability` 的快照
- 目前不从 web 端直接修改 agent 状态
