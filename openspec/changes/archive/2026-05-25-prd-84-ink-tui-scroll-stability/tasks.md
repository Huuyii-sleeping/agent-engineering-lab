## 1. 测试

- [x] 1.1 新增空 scheduled tick 不改变状态对象的单元测试

## 2. 实现

- [x] 2.1 TTY interactive Ink render 启用 alternate screen
- [x] 2.2 scheduled tick busy 标记改为 ref，避免空轮询触发渲染
- [x] 2.3 空 scheduled tick 不调用 `setState`

## 3. 验证与收口

- [x] 3.1 运行相关单元测试、Ink smoke 和 `pnpm build`
- [x] 3.2 运行 `openspec validate`、`openspec status`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
