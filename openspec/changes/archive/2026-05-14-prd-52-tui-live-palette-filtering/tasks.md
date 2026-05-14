## 1. PRD 与规格

- [x] 1.1 新增 `PRD-52` 增量文档，定义 TUI live palette filtering 范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. TUI live filtering

- [x] 2.1 在 keypress 阶段推导 palette query 并即时刷新结果
- [x] 2.2 将 Enter 语义收口为直接执行当前选中项

## 3. 验证

- [x] 3.1 focused tests 覆盖 live query 推导
- [x] 3.2 运行 build、OpenSpec strict 和差异检查
