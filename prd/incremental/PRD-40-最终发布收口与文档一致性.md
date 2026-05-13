# PRD-40 最终发布收口与文档一致性

## 背景

PRD-39 已完成 runtime 剩余边界收口，学习沉淀也已经从 `01-26` PRD 流水账改为只维护 `operations/` 主线。当前剩余工作不应继续拆模块，而应完成最终 release closeout：

- 确认统一发布检查入口真实可执行。
- 清理 README / PRD 路线图 / 交接文档中与当前状态不一致的说明。
- 确认 OpenSpec active changes 清空，正式 specs 无未收口占位。
- 记录本轮最终验证证据。

## 目标

- 新增 PRD-40 和 OpenSpec change，作为本轮最终发布收口记录。
- 更新根 README，明确 operations 文档入口和 `release:check` 覆盖范围。
- 更新 `apps/agent-cli/README.md` 中过期绝对路径链接。
- 更新 PRD 路线图，记录 PRD-21 到 PRD-40 的生产级架构与最终收口阶段。
- 更新当前对话交接文档，记录 PRD-40 release closeout 状态。
- 执行统一发布检查和 OpenSpec / diff 校验。

## 非目标

- 不新增运行时能力。
- 不继续拆分模块。
- 不修改 release smoke 业务逻辑。
- 不改变 `release:check` 当前覆盖脚本，除非验证发现缺口。
- 不执行 `git push`。

## 验收标准

1. `pnpm release:check` 通过。
2. `openspec validate --all --strict` 通过。
3. `openspec list --json` 显示无活动 change。
4. `git diff --check` 通过。
5. README / PRD 路线图 / 交接文档不再引用已删除的 `01-26` 学习流水账文档。
6. OpenSpec change 已归档，并本地提交。
