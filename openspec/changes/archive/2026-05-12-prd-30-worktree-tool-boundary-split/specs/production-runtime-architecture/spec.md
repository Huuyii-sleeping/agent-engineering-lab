## ADDED Requirements

### Requirement: Worktree tool internals MUST separate store runner manager and tool facade boundaries
Worktree 工具内部 MUST 区分 record store、command/git runner、manager 编排与 tool facade，使执行车道持久化、命令运行和工具对外契约可以独立演进。

#### Scenario: 调整 worktree 持久化
- **WHEN** 系统调整 worktree index、event log、record normalize 或 closeout normalize 逻辑
- **THEN** 维护者主要修改 worktree store 边界，而不是修改 command runner 或 tool schemas

#### Scenario: 调整 command 或 dirty guard 检测
- **WHEN** 系统调整 shell command 执行、git metadata 检测或 dirty files 查询
- **THEN** 维护者主要修改 worktree runner 边界，而不是修改 store 或 tool facade

#### Scenario: 读取 worktree public facade
- **WHEN** 维护者阅读 `tools/worktree.ts`
- **THEN** 该文件主要表达 worktree tool schema 与 public handlers，而不是直接承载 store、runner 和流程编排的全部细节
