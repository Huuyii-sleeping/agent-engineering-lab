## 1. PRD 与规格

- [x] 1.1 新增 `PRD-62` 增量文档、proposal / design / delta spec

## 2. daemon-backed TUI reuse

- [x] 2.1 为 service API 增加共享 client、远端 tool-call 面和端口约定
- [x] 2.2 让 `agent-cli tui` 优先 attach 到运行中的 daemon，并在不可复用时回退 embedded host

## 3. 验证与文档

- [x] 3.1 补 focused tests，并同步 README
- [x] 3.2 运行 build、OpenSpec strict 和差异检查
