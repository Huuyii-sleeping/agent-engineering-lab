# release-readiness-closeout Specification

## Purpose
定义发布收尾阶段的统一验证入口和正式 capability spec 质量门禁，确保已交付能力纳入发布检查且归档规格不残留占位说明。
## Requirements
### Requirement: Unified release check covers implemented validation suites
仓库 MUST 提供单一的正式发布检查入口，并且该入口 MUST 覆盖当前已经实现且已定义脚本入口的关键回归、smoke 与构建验证，避免出现“能力已交付但统一门禁未覆盖”的状态。

#### Scenario: 执行统一发布检查
- **WHEN** 维护者运行正式发布检查命令
- **THEN** 系统会串行执行 lint、unit test、build，以及当前已实现关键能力对应的 smoke / regression 脚本

#### Scenario: 新增后期能力验证脚本后更新门禁
- **WHEN** 仓库新增一个代表已正式交付能力的验证脚本，并将其视为发布前必跑检查
- **THEN** 统一发布检查入口必须同步纳入该脚本，而不是长期依赖人工补跑

### Requirement: Archived capability specs keep a non-placeholder purpose
归档后的正式 capability spec MUST 包含可读、明确的 `Purpose` 说明，不得继续保留 `TBD`、模板注释或其他未收口占位文本。

#### Scenario: 读取正式 capability spec
- **WHEN** 维护者打开 `openspec/specs/<capability>/spec.md`
- **THEN** 文件中的 `Purpose` 段落应直接说明该 capability 的职责与边界，而不是要求读者回到历史 change 推断含义

#### Scenario: 归档前检查规格基线
- **WHEN** 一个 change 即将归档并生成或更新正式 capability spec
- **THEN** 生成后的正式 spec 不得残留 `Purpose TBD` 之类的占位文本

### Requirement: Runtime closeout MUST leave active changes archived and validation evidence documented
Runtime 总收口完成后 MUST 归档 OpenSpec change、清空 active changes，并在交接文档中记录 focused tests、build、OpenSpec strict 与 diff check 验证结果。

#### Scenario: 完成 runtime closeout
- **WHEN** PRD-39 实现完成并归档
- **THEN** `openspec list --json` 返回无活动 change，交接文档记录本轮验证命令与本地 commit 状态
