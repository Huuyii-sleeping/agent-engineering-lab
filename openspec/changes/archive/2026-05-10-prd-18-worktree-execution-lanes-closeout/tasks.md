## 1. 数据模型与持久化升级

- [x] 1.1 扩展 task 记录结构，新增 `worktree_state`、`last_worktree`、`closeout` 并兼容旧数据回填
- [x] 1.2 扩展 worktree 记录结构，新增 `last_entered_at`、`last_command_at`、`last_command_preview`、`closeout`
- [x] 1.3 更新任务列表/查询输出，让车道状态、最近车道与收尾结果可见

## 2. Worktree 车道与收尾实现

- [x] 2.1 新增 `worktree_enter(...)` 并同步 task/worktree 最近车道信息
- [x] 2.2 改造 `worktree_run(...)`，记录最近命令时间与命令摘要
- [x] 2.3 实现统一 `worktree_closeout(...)`，收敛 `keep/remove` 分支并保持 task、worktree、events 一致
- [x] 2.4 为 remove 路径增加 git 脏改动检查与 `force` 语义

## 3. 验证与回归

- [x] 3.1 补充 PRD-18 smoke，覆盖 enter、run、closeout 和脏改动保护
- [x] 3.2 运行 `pnpm build`、相关 smoke/测试、`openspec status` 与 `openspec validate`
- [x] 3.3 清理本次测试产生的运行产物并归档任务状态
