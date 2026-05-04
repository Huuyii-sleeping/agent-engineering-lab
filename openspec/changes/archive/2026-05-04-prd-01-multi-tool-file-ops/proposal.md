## Why

PRD-00 已验证最小 Agent 循环与单 `bash` 工具可用，但仍无法直接进行文件读写与精确编辑，限制了日常编码任务闭环。当前需要在不改变主循环契约的前提下补齐基础文件工具能力，作为后续任务系统与子代理能力的前置基础。

## What Changes

- 新增三个工具：`read_file(path, limit?)`、`write_file(path, content)`、`edit_file(path, old_text, new_text)`。
- 新增 `safePath` 路径校验：统一解析绝对路径并拒绝工作区越界访问。
- 新增工具分发映射（`TOOL_HANDLERS`）：按工具名执行对应处理函数，保持主循环结构不变。
- 约束 `edit_file` 仅替换首个精确匹配片段；未匹配时返回明确错误。
- 保持 PRD-00 现有 `bash` 安全策略与 Agent 轮次行为不回归。

## Capabilities

### New Capabilities
- `multi-tool-file-ops`: 在工作区内提供安全文件读取、覆盖写入与精确文本编辑能力，并统一通过工具分发调用。

### Modified Capabilities
- 无。

## Impact

- 影响代码：`agent_dev/from-scratch-agent/src` 下工具定义、工具处理层与主循环工具分发逻辑。
- 影响接口：模型可调用工具集合从单 `bash` 扩展到 `bash + read_file + write_file + edit_file`。
- 依赖影响：无新增外部依赖，继续使用 Node.js 标准库与现有 OpenAI SDK。
- 系统影响：CLI 交互方式不变；文件操作安全边界由 `safePath` 强制约束在工作目录内。
