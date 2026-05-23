# PRD-78 用户输入意图本地观测标签

## 背景

对比 `06b-negative-keyword-analysis.md` 后，仓库已有本地 observability、隐私最小化和 remote telemetry reserved gap 说明，但没有把用户输入中的“负面反馈 / 继续执行”类意图转成结构化本地诊断信号。

当前 `loop_start` 已记录最新用户输入摘要。本轮不新增远端上报，不改变安全策略，也不阻断 prompt，只在本地 observability 事件里增加最小分类标签，用于后续回放、调试和产品问题定位。

## 目标

- 在 query round 开始时识别用户输入是否包含负面反馈或继续执行意图。
- 只记录布尔标签、匹配类别和输入长度，不新增原始 prompt 副本。
- 分类结果只进入现有本地 observability 数据面，遵守已有 minimal / disabled 姿态。
- 保持 query 主流程、hook、model request 和工具执行语义不变。

## In Scope

- 新增用户输入意图分类 helper。
- 在 `loop_start` observability 事件 payload 中增加 `userInputIntent`。
- 增加单元测试覆盖负面反馈、继续执行、普通输入和不泄露原文。
- 增加 PRD-78 smoke 测试，验证本地事件落盘中包含分类标签。
- 更新 `observability-replay-debug` OpenSpec delta。

## Out of Scope

- 不实现远端 analytics / telemetry 上报。
- 不实现反馈问卷、transcript share 或训练数据上传。
- 不使用分类结果阻断、改写或重排用户 prompt。
- 不引入机器学习模型或外部词库。

## 验收标准

- 包含负面反馈关键词的输入产生 `negativeFeedback: true`。
- 包含继续执行关键词的输入产生 `keepGoing: true`。
- 普通输入产生两个标签均为 `false`。
- `userInputIntent` 不包含原始 prompt 文本。
- 相关单测、smoke、OpenSpec 校验和 `pnpm build` 通过。
