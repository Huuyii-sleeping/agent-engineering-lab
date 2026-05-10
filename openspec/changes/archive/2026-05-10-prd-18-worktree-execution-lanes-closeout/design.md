## Context

PRD-06 已经提供 task 与 worktree 的基础绑定能力，但当前实现只有 `create/run/keep/remove` 四个薄接口，运行时缺少“进入车道”“最近执行痕迹”“统一收尾决策”三层信息。结果是 task 记录只知道绑了哪个 worktree，worktree 记录只知道当前状态，事件日志也无法稳定回答“最近在哪条车道工作、最后怎么收尾、删除前是否有脏改动”。

PRD-18 是一次跨 `task-board`、`worktree`、`autonomy` 和测试层的横切增强，但范围仍应保持克制：不重做 worktree 架构，只在现有持久化模型和工具接口上补齐进入态、closeout 和安全回收语义。

## Goals / Non-Goals

**Goals:**

- 为 task 与 worktree 持久化记录补充可恢复的车道元数据。
- 将 `worktree_enter` 与 `worktree_run` 语义拆分，保留“进入时间”和“最后命令摘要”。
- 用统一 `worktree_closeout` 收敛 keep/remove 分支，确保 task、worktree、events 同步更新。
- 在移除前增加脏改动检查，默认阻止误删未提交工作。
- 保持既有 worktree 名称、目录布局和基础工具契约兼容。

**Non-Goals:**

- 不引入完整 code review、PR 流转或多阶段审批平台。
- 不扩展到企业级 git 运维策略，例如 stash 策略、自动 cherry-pick 或远程分支治理。
- 不重构自治框架，只补其消费的新 task/worktree 元数据。

## Decisions

### 决策 1：task 与 worktree 分别维护独立的 lane/closeout 元数据

- 方案：在 task 记录新增 `worktree_state`、`last_worktree`、`closeout`，在 worktree 记录新增 `last_entered_at`、`last_command_at`、`last_command_preview`、`closeout`。
- 原因：task 负责表达“任务当前在哪条车道推进”，worktree 负责表达“车道自身最近发生了什么”，两者职责不同，不能只靠单一 `status` 或 `worktree` 字段混用。
- 备选：仅在 worktree 记录扩字段，task 继续只保存 `worktree`。
- 不采用原因：这样 task 列表无法直接回答“最近车道”和“收尾结果”，用户视角的信息会缺失。

### 决策 2：保留 `worktree_run`，但新增显式 `worktree_enter`

- 方案：`worktree_enter(name, task_id?)` 只更新进入态与最近车道，不执行命令；`worktree_run(name, command)` 继续负责命令执行，同时回写最近命令信息。
- 原因：PRD-18 需要把“进入车道”变成一个可恢复、可观察的独立动作，而不是隐含在运行命令里。
- 备选：让 `worktree_run` 自动代表 enter，不新增工具。
- 不采用原因：语义仍然耦合，无法表达“只切到该车道查看/准备，但本轮未执行命令”的状态。

### 决策 3：`keep` / `remove` 统一建模为 `worktree_closeout`

- 方案：新增 `worktree_closeout(name, action, task_id?, force?)`，其中 `action` 取值为 `keep` 或 `remove`；原有 `worktree_keep/remove` 内部复用同一 closeout 逻辑。
- 原因：收尾时需要同时更新 task closeout、worktree closeout 与事件日志，分两套逻辑很容易产生漂移。
- 备选：继续让 `keep` / `remove` 分散维护，只补少量同步代码。
- 不采用原因：重复逻辑会让后续恢复、回放和审计更难保持一致。

### 决策 4：删除前脏改动检查以 git 为优先，非 git 目录退化为可移除

- 方案：对位于 git 仓库内的 worktree，移除前执行 `git status --short` 检查；存在输出时默认阻止 `remove`，除非显式 `force=true`。非 git 回退目录不做内容 diff，仅按目录删除。
- 原因：PRD-18 需要先保护真实开发车道中的未提交工作，同时避免在 fallback 目录场景做不可靠的通用文件差异扫描。
- 备选：所有目录都做递归文件扫描，尝试判断“脏改动”。
- 不采用原因：成本高、误报多，而且无法准确复用 git 的已跟踪/未跟踪语义。

## Risks / Trade-offs

- [旧数据兼容] 旧的 task/worktree 记录缺少新增字段 → 在加载层做 schema 升级与默认值回填。
- [接口增多] `enter` / `run` / `closeout` 三个动作需要模型理解更多语义 → 工具描述里明确职责，并保留旧 `keep/remove` 兼容入口。
- [脏改动检查过严] 某些临时目录只想快速清理 → 提供显式 `force`，但默认安全优先。
- [task 与 worktree 不一致] 调用方可能不传 `task_id` 完成 closeout → closeout 逻辑支持“按显式 task_id 优先，否则按最近绑定 task 回填”。

## Migration Plan

1. 扩展 task/worktree 记录加载与保存结构，保证旧数据自动回填默认字段。
2. 新增 `worktree_enter` 与 `worktree_closeout`，并将 `worktree_keep/remove` 改为复用 closeout 逻辑。
3. 更新 task 列表与查询输出，让新增 lane/closeout 信息可见。
4. 增加 PRD-18 smoke 和必要单测，覆盖 enter、closeout、一致性与脏改动保护。
5. 若实现回退，只需移除新增字段与工具入口，保留原有 `create/run/keep/remove` 路径即可回到 PRD-06 基线。

## Open Questions

- `worktree_closeout` 在未显式传入 `task_id` 时，是否要强制依赖 worktree 的最近绑定任务，还是允许只更新车道不更新任务？本次实现先允许两者都支持，但优先同步任务。
