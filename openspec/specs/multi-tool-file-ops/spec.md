# multi-tool-file-ops Specification

## Purpose
Define workspace-scoped file operations and safe tool-calling behavior.
## Requirements
### Requirement: Agent SHALL provide workspace-scoped file read/write/edit tools
系统 SHALL 提供 `read_file(path, limit?)`、`write_file(path, content)`、`edit_file(path, old_text, new_text)` 三个文件工具，并允许模型在同一轮工具调用流程中使用。

#### Scenario: 在工作区内读取文件
- **WHEN** 模型调用 `read_file` 且 `path` 位于工作区内
- **THEN** 系统返回文件内容（若提供 `limit` 则按限制截断返回）

#### Scenario: 在工作区内写入文件
- **WHEN** 模型调用 `write_file` 且 `path` 位于工作区内
- **THEN** 系统覆盖写入 `content` 并返回成功结果

#### Scenario: 在工作区内精确编辑文件
- **WHEN** 模型调用 `edit_file` 且文件中存在 `old_text`
- **THEN** 系统仅替换第一个精确匹配片段并返回成功结果

### Requirement: File tools MUST enforce safe path boundary
所有文件工具 MUST 在执行前进行路径安全校验；任何越界路径 MUST 被拒绝且不得触发实际文件读写。

#### Scenario: 相对路径越界被拒绝
- **WHEN** 模型传入包含 `..` 导致越过工作区根目录的路径
- **THEN** 系统返回明确错误并拒绝执行

#### Scenario: 绝对路径越界被拒绝
- **WHEN** 模型传入不在工作区根目录下的绝对路径
- **THEN** 系统返回明确错误并拒绝执行

### Requirement: Main loop behavior MUST remain compatible with PRD-00
扩展文件工具后，主循环 MUST 继续遵守 PRD-00 的 tool-calling 契约，不得引入流程回归。

#### Scenario: 无工具调用时正常结束
- **WHEN** 模型响应不包含工具调用
- **THEN** 主循环立即结束当前轮次

#### Scenario: 多工具调用按顺序执行并回填
- **WHEN** 模型响应包含一个或多个工具调用（含 `bash` 与文件工具）
- **THEN** 系统按顺序执行并逐条回填 `role: tool` 消息后进入下一轮

### Requirement: Tool execution MUST pass through policy evaluation
所有工具调用 MUST 在执行前经过统一策略评估，并基于评估结果执行放行、拦截或审批流程。

#### Scenario: 高风险命令无审批被拦截
- **WHEN** 调用高风险 `bash` 命令且无有效审批
- **THEN** 返回结构化错误并阻止执行

#### Scenario: 普通读操作放行
- **WHEN** 调用低风险 `read_file`
- **THEN** 策略允许并正常执行

### Requirement: File tools MUST enforce symlink-safe real path boundaries
文件工具 MUST 在执行前基于 `realpath` 或等效机制校验最终目标路径，拒绝通过 symlink、junction 或等效重定向实现的工作区逃逸。

#### Scenario: Symlink points outside the workspace
- **WHEN** 模型传入的工作区内路径经解析后实际落到工作区外
- **THEN** 系统拒绝该读写或编辑操作
- **AND** 返回明确的越界错误

### Requirement: File tools MUST support sensitive path policy and managed write mode
文件工具 MUST 支持敏感路径 denylist 与受管写入模式，避免本地写入默认对所有工作区路径等价开放。

#### Scenario: Write targets a denied sensitive path
- **WHEN** 写类工具尝试命中受保护的敏感路径策略
- **THEN** 系统阻止写入或要求更高等级审批

