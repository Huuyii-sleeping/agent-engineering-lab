## 1. 文件工具与安全边界

- [x] 1.1 实现 `safePath(path)`，统一将输入路径解析为工作区内绝对路径并拒绝越界访问。
- [x] 1.2 实现 `read_file(path, limit?)`，支持可选输出截断与可读错误返回。
- [x] 1.3 实现 `write_file(path, content)`，覆盖写入并返回成功结果。
- [x] 1.4 实现 `edit_file(path, old_text, new_text)`，仅替换首个精确匹配；未匹配时返回明确错误。

## 2. 工具注册与主循环分发

- [x] 2.1 将 `read_file/write_file/edit_file` 注册到工具定义集合，与 `bash` 并存。
- [x] 2.2 增加 `TOOL_HANDLERS` 或等价分发映射，按工具名路由执行逻辑。
- [x] 2.3 更新 `agentLoop` 工具执行段，保持“顺序执行 + 逐条回填 `role: tool`”契约不变。

## 3. 验收与回归

- [x] 3.1 验证 AC-01-1：在工作区内完成一次 read/write/edit 工具调用闭环。
- [x] 3.2 验证 AC-01-2：构造越界路径调用并确认被拒绝。
- [x] 3.3 验证 AC-01-3：无工具调用与 `bash` 调用场景行为与 PRD-00 一致，无回归。
