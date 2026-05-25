# Tasks

## 1. Tests

- [x] 1.1 补左右键移动光标测试
- [x] 1.2 补移动后中间插入测试
- [x] 1.3 补 backspace/delete 基于光标删除测试
- [x] 1.4 补组件级中间光标渲染测试

## 2. Implementation

- [x] 2.1 `InkTuiInputState` 增加 `cursorIndex`
- [x] 2.2 reducer 支持 left/right/home/end
- [x] 2.3 reducer 支持 cursor 位置插入、backspace、delete
- [x] 2.4 render model 支持中间 cursor
- [x] 2.5 submit/clear 后重置 cursor

## 3. Validation

- [x] 3.1 运行 Ink TUI 单元测试
- [x] 3.2 运行 `pnpm build`
- [x] 3.3 运行 OpenSpec status 和 validate
- [x] 3.4 archive 变更并本地 commit
