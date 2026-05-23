# PRD-79 隐藏能力与功能披露治理

## 背景

对比 `11-hidden-features-and-easter-eggs.md` 后，仓库已经具备 command palette、workflow、skills、prompt dump、MCP、data governance 等本地控制面，但这些能力目前分散在 help、palette、命令分发和治理文档中，缺少一个专门回答“有没有隐藏命令、内部彩蛋、beta-only surface”的本地披露入口。

本轮不新增隐藏功能或彩蛋，而是补齐功能披露治理：把本地功能面、可见性、稳定性和 reserved gap 明确列出，降低能力藏在代码里的维护风险。

## 目标

- 提供本地 `/features` 命令，展示 feature disclosure / hidden surface 清单。
- 清单明确当前已公开的本地能力入口，以及隐藏命令、隐藏彩蛋、beta-only header 等 reserved gap 状态。
- 将 `/features` 纳入 help 与 palette，保证入口可发现。
- 不引入真实隐藏命令、彩蛋或远端 feature flag 机制。

## In Scope

- 新增 CLI feature disclosure registry。
- 新增 `/features` 本地命令和渲染输出。
- 将 `/features` 加入 runtime help 与 command palette。
- 增加单元测试和 smoke 测试，验证清单不报告未登记隐藏能力。
- 更新 `production-runtime-architecture` OpenSpec delta。

## Out of Scope

- 不新增隐藏命令、彩蛋或 buddy/persona 功能。
- 不实现远端 feature flag service、beta header 或实验分流。
- 不改变现有命令执行、palette 搜索排序或权限模型。

## 验收标准

- `/features` 输出包含已公开本地功能面及 `hidden commands: none registered`。
- `/help` 与 `/help runtime` 可发现 `/features`。
- `/palette feature` 可找到 `/features`。
- feature registry 中不存在 `visibility: "hidden"` 的启用项。
- 相关单测、smoke、OpenSpec 校验和 `pnpm build` 通过。
