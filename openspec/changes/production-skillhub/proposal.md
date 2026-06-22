## Why

当前 Skill Hub 已经从前端 mock 演进为本地标准 Skill 包扫描，但它仍然不是生产级 Skill 管理系统：没有远端 registry、没有 custom 上传校验、没有来源区分、没有下载/安装状态机，也没有把已安装 skill 与 Agent 草稿配置真正联动。

用户希望 Skill Hub 成为真实能力市场，而不是展示页面。因此本变更需要把 Skill Hub 从“本地文件列表”升级为“Skill 包管理系统”的第一阶段，建立可持续扩展的领域模型、BFF 服务边界和 Web 交互闭环。

## What Changes

- 将 Skill Hub 数据模型升级为区分 `builtin`、`remote`、`custom` 三类来源。
- 引入生产级状态机：`available`、`downloaded`、`installed`、`updateAvailable`、`invalid`。
- 新增远端 registry 同步能力，支持从配置的 registry endpoint 拉取可用 skill。
- 新增 custom skill 上传 API，要求上传内容符合标准 Skill 包规则。
- 新增 Skill 下载/安装/卸载流程，并将结果持久化到 BFF 本地业务状态。
- 将 Agent 草稿配置页的 skill 选择来源切换为已安装 skill registry，而不是静态 catalog。

In Scope:

- BFF Skill 领域拆分为 registry、store、validator、installer 等服务。
- 支持 JSON package 格式的远端 skill 下载，作为后续 zip/package registry 的稳定前置接口。
- Web Skill Hub 展示来源 tag、状态、下载/安装动作和 custom 上传入口。
- Agent 配置页仅允许选择已安装 skill。
- 单元测试覆盖 registry、install、custom upload、Agent 配置数据源。

Out of Scope:

- 真实公网 registry 服务端建设。
- 包签名、组织级权限、付费市场、评分评论。
- scripts 执行沙箱与运行时权限审批完整实现。
- 多版本并行运行时加载。

## Capabilities

### New Capabilities

- `production-skill-registry`: 管理 builtin、remote、custom skill 来源、状态和元数据。
- `skill-package-validation`: 校验上传和下载的 skill 包是否符合标准规则。
- `agent-skill-binding`: Agent 草稿只能绑定已安装 skill，并为后续版本/config 绑定预留结构。

### Modified Capabilities

- `web-skillhub`: 从本地展示型 registry 升级为真实包管理入口。
- `agent-profile-management`: skill 选择来源从静态 catalog 切换为 BFF installed registry。

## Impact

- 影响 BFF：
  - `apps/bff/src/skills/**`
  - `apps/bff/src/app.module.ts`
  - `apps/bff/test/unit/server.test.ts`
- 影响 Web：
  - `apps/web-console/src/api.ts`
  - `apps/web-console/src/app/App.tsx`
  - `apps/web-console/src/features/skills/**`
  - `apps/web-console/src/features/agents/pages/AgentConfigPage.tsx`
- 新增本地 registry seed：
  - `registries/default-skill-registry.json`
