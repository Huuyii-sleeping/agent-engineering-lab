# PRD-01 多工具与文件操作

## 目标

在不改变 PRD-00 主循环的前提下，扩展文件读写编辑能力。

## 范围（In Scope）

- 新增工具：
  - `read_file(path, limit?)`
  - `write_file(path, content)`
  - `edit_file(path, old_text, new_text)`
- `safePath` 路径校验与防越界。
- `TOOL_HANDLERS` 映射分发。

## 非目标（Out of Scope）

- 任务系统、子代理、技能加载、上下文压缩、团队能力。

## 功能要求

- 所有文件操作必须经过 `safePath`。
- 越界路径直接拒绝。
- `edit_file` 仅替换首个精确匹配，找不到返回明确错误。

## 验收标准（AC）

- AC-01-1：`read/write/edit` 在工作区内可用。
- AC-01-2：路径越界被拒绝。
- AC-01-3：主循环行为与 PRD-00 一致，不回归。

## 实施顺序

1. 实现 `safePath`。
2. 实现 `runRead/runWrite/runEdit`。
3. 扩展 `TOOL_HANDLERS` 并补充基本用例验证。

