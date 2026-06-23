## Context

Skill Hub 的生产级目标不是“把列表显示得更像产品”，而是让 skill 成为可管理的软件包。核心边界包括：

- Registry：可发现哪些 skill。
- Package：skill 的标准包结构和校验规则。
- Install：从 available 到 installed 的状态转移。
- Binding：Agent 草稿引用已安装 skill。

## Goals / Non-Goals

Goals:

- 建立可扩展的 Skill Hub 领域模型。
- 支持 builtin、remote、custom 三种来源并在 UI 上明确区分。
- 允许用户从远端 registry 下载 skill，也允许上传受规则约束的 custom skill。
- Agent 配置只能选择 installed skill，避免引用不可用能力。

Non-Goals:

- 不在本阶段实现真实远端 registry 后台。
- 不在本阶段实现 zip 解包、签名验签和脚本沙箱。
- 不在本阶段实现完整多版本绑定 UI。

## Data Model

### SkillRegistryItem

```ts
type SkillSourceType = "builtin" | "remote" | "custom";
type SkillStatus = "available" | "downloaded" | "installed" | "updateAvailable" | "invalid";

type SkillRegistryItem = {
  id: string;
  name: string;
  description: string;
  summary: string;
  category: string;
  provider: string;
  version: string;
  runtime: string;
  permissions: string[];
  updatedAt: string;
  maturity: "stable" | "beta";
  tags: string[];
  entry: "SKILL.md";
  sourceType: SkillSourceType;
  status: SkillStatus;
  installed: boolean;
  validationErrors: string[];
};
```

### Remote Registry

第一阶段使用 JSON endpoint，格式如下：

```json
{
  "skills": [
    {
      "id": "remote-prd-review",
      "version": "1.0.0",
      "packageUrl": "https://registry.example/remote-prd-review-1.0.0.json",
      "metadata": {}
    }
  ]
}
```

`packageUrl` 返回 JSON package：

```json
{
  "files": [
    { "path": "SKILL.md", "content": "---\nname: remote-prd-review\n..." },
    { "path": "skill.json", "content": "{...}" }
  ]
}
```

这个格式不是最终市场包格式，但它为后续 zip、签名、hash 校验保留了明确边界。

## BFF Design

`apps/bff/src/skills/` 拆成：

- `skill-types.ts`：领域类型。
- `skill-validator.service.ts`：校验标准 Skill 包。
- `skill-store.service.ts`：读写 builtin/downloaded/custom skill 文件。
- `skill-installer.service.ts`：download/install/uninstall/upload 状态转移。
- `skill-registry.service.ts`：聚合 builtin、remote、custom、installed 状态。
- `skills.controller.ts`：HTTP 入口。

持久化结构继续使用 `LocalStoreService`，新增：

```json
{
  "skills": {
    "installedSkillIds": ["code-workspace"],
    "downloadedSkillIds": ["remote-prd-review"],
    "customSkillIds": ["my-custom-skill"]
  }
}
```

## API Design

```text
GET  /api/skills
GET  /api/skills/registry
PUT  /api/skills/registry
POST /api/skills/registry/sync
POST /api/skills/:skillId/download
POST /api/skills/:skillId/install
POST /api/skills/:skillId/uninstall
POST /api/skills/upload
```

`GET /api/skills/registry` 返回当前远端 registry 配置、最后同步时间、同步错误和缓存条目数。

`PUT /api/skills/registry` 持久化远端 registry URL。URL 支持 HTTP(S) endpoint，也支持本地文件路径用于开发和测试。保存后不会隐式下载 package，必须由同步或下载流程触发。

`POST /api/skills/registry/sync` 主动读取当前远端 registry index，校验 index 格式并写入本地缓存。Skill Hub 列表优先使用缓存的远端 index，让页面和远端服务之间形成明确同步边界。

`POST /api/skills/upload` 第一阶段接受 JSON：

```json
{
  "files": [
    { "path": "SKILL.md", "content": "..." },
    { "path": "skill.json", "content": "..." }
  ]
}
```

## Validation Rules

- 必须包含 `SKILL.md` 和 `skill.json`。
- `SKILL.md` frontmatter 必须包含 `name` 和 `description`。
- skill id 只能是小写字母、数字和短横线。
- 文件路径不能包含 `..`、绝对路径、反斜杠或空段。
- 单个包最多 32 个文件。
- 单个文件最大 128KB。
- 第一阶段禁止上传 `scripts/`，避免执行型能力绕过审批。

## Web Design

- Skill Hub 卡片显示来源 tag 和状态 tag。
- `available` 显示“下载”，`downloaded` 显示“安装”，`installed` 显示“已安装/卸载”。
- custom 上传入口先使用 textarea 输入 JSON package，后续再升级为文件上传。
- Agent 配置页接收 installed skills 作为 props，只展示 installed skill。

## Risks / Trade-offs

- JSON package 不如 zip 真实，但它能先打通包校验、远端下载和安装状态机，风险更低。
- custom 上传禁用 scripts 会限制高级能力，但避免第一阶段引入执行安全问题。
- 仍使用 LocalStoreService 作为持久层，适合本地产品第一阶段；未来需要迁移到 SQLite 或服务端数据库。
