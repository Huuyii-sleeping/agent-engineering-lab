## Context

当前 `from-scratch-agent` 已完成 PRD-00：具备稳定的 Agent 主循环、单工具 `bash`、安全拦截和 CLI 交互。但生产可用的编码代理还缺少基础文件操作能力，导致无法在对话中完成“读代码 -> 修改代码 -> 回写文件”的闭环。

约束条件：
- 不改变 PRD-00 已验证的主循环契约（assistant/tool 回填与退出条件）。
- 文件操作必须限制在工作目录内，禁止路径越界。
- 保持实现轻量，不引入额外三方依赖。

## Goals / Non-Goals

**Goals:**
- 引入 `read_file`、`write_file`、`edit_file` 三个工具。
- 在工具层实现统一 `safePath`，保证路径在工作区根目录内。
- 为工具调用建立统一分发表，避免在主循环中硬编码多个 if 分支。
- 保持 `bash` 行为、CLI 行为与 PRD-00 一致。

**Non-Goals:**
- 不引入任务系统、子代理、技能加载、上下文压缩、团队与 worktree。
- 不实现增量写入、批量编辑、正则编辑等高级文件能力。
- 不改变模型提示词策略与会话持久化策略。

## Decisions

决策 1：新增 `safePath` 并在所有文件工具入口强制调用。
- 选择：使用 `path.resolve` + `path.relative` 校验目标路径是否在 `process.cwd()` 下。
- 理由：实现简单、可读性高、跨平台可用，能覆盖相对路径与 `..` 越界场景。
- 备选：仅做字符串前缀匹配。
- 不采用原因：Windows/Unix 路径分隔符和大小写差异下易误判，存在安全漏洞。

决策 2：将文件工具封装在独立模块，并导出 `FILE_TOOLS` 与 `runToolByName`。
- 选择：工具定义与工具执行绑定到 `tools` 层，主循环只负责调度。
- 理由：符合单一职责，后续扩展 `todo/task/subagent` 时可直接复用分发模式。
- 备选：在 `agent-loop.ts` 中直接处理每个工具。
- 不采用原因：主循环会快速膨胀，违背“主文件过大要拆分”的约束。

决策 3：`edit_file` 仅替换首个精确匹配片段。
- 选择：基于 `indexOf(old_text)` 找到第一个位置后拼接替换。
- 理由：行为确定性强，便于模型理解与测试验证，符合 PRD-01 要求。
- 备选：全量替换或正则替换。
- 不采用原因：易造成过度修改，增加误改风险。

## Risks / Trade-offs

- [Risk] 工具输出过长会挤占上下文。  
  -> Mitigation: `read_file` 支持 `limit` 截断并返回明确标记。
- [Risk] `edit_file` 精确匹配失败会导致频繁重试。  
  -> Mitigation: 返回可读错误，提示先用 `read_file` 获取精确片段。
- [Risk] 路径校验在极端符号链接场景可能不完全等价于真实权限边界。  
  -> Mitigation: 当前阶段以工作目录逻辑边界为准，后续如需加强可加入 `realpath` 校验。

## Migration Plan

1. 新增文件工具模块：`safePath`、`runReadFile`、`runWriteFile`、`runEditFile`、工具定义导出。
2. 引入统一工具分发函数 `runToolByName`，并在主循环替换现有 `bash` 单分支逻辑。
3. 保持 CLI 与 `agentLoop` 对外行为不变，执行编译和冒烟验证。
4. 若回归异常，可回滚到 PRD-00 版本的 `agent-loop.ts` 与工具定义。

Rollback strategy:
- 回退本次新增工具模块与分发表改动，恢复仅 `bash` 工具集，即可回到 PRD-00 已验证基线。

## Open Questions

- `read_file(limit)` 的默认值是否应在后续阶段参数化为环境变量？
- 后续 PRD 是否需要在 `write_file/edit_file` 引入“覆盖确认”机制以降低误写风险？
