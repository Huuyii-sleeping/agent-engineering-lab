# production-skillhub-detail-panel

## Why

SkillHub 卡片已经能展示基础市场信息和安装状态，但生产级排障需要更集中的详情视图。用户在安装、升级或回滚前，应能快速看到版本、来源、权限、hash、校验错误和可回滚目标。

本阶段补一个轻量详情面板，不新增 BFF 数据模型，先把现有字段组织成可诊断界面。

## What Changes

- SkillHub Registry 增加右侧详情面板。
- Skill 卡片增加“详情”入口。
- 详情面板展示版本、安装、来源、权限、hash、入口文件、标签和校验错误。
- 详情面板可触发现有主操作和回滚操作。

## Non-Goals

- 不新增多版本历史 API。
- 不展示 Agent 使用影响范围。
- 不实现 Markdown README 预览。
- 不修改 BFF Skill registry 响应结构。

## Acceptance Criteria

- 页面默认展示一个 Skill 的详情。
- 点击 Skill 卡片详情入口能切换详情对象。
- 详情面板展示 installed/available/previous 版本信息。
- 详情面板在存在上一版本时展示并可触发回滚操作。
- 测试覆盖详情面板的关键文本渲染。
