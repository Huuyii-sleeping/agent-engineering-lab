# mature-skillhub-registry-service

## 背景

当前 SkillHub 已支持 static JSON remote registry：配置 registry URL、同步 index、下载 package、hash 校验、安装和 Agent 绑定。这个链路证明了能力模型，但它仍然缺少成熟 marketplace 所需的独立 registry 后端、持久化数据层、包存储目录和下载 API。

## 目标

- 新增独立 `apps/skill-registry` 服务，可通过 Docker 启动。
- 使用宿主机挂载目录持久化 registry 数据和 package 文件。
- 第一阶段使用 SQLite 存储 publisher、skill、version、download 事件。
- 提供 registry API，供 BFF 拉取 skill 列表、详情和下载 package。
- BFF 支持 `SKILL_REGISTRY_SERVICE_URL`，优先连接 registry service，同时保留现有 static JSON fallback。
- 提供 Docker Compose，使本机可以通过固定挂载目录管理 registry 数据。

## 非目标

- 本阶段不实现发布者登录、审核后台和人工审核流。
- 本阶段不实现签名验签。
- 本阶段不把 package 格式升级为 zip/tar，继续兼容当前 JSON package。
- 本阶段不迁移 Web 的完整 marketplace 详情页，只先替换数据来源能力。

## 验收标准

- `pnpm --filter skill-registry build/test` 可通过。
- `docker compose` 可启动 skill-registry，并把数据放在 `runtime/skill-registry/`。
- BFF 设置 `SKILL_REGISTRY_SERVICE_URL=http://127.0.0.1:3190` 后，SkillHub 可从 registry service 获取远端 skill 并下载。
- 未设置 `SKILL_REGISTRY_SERVICE_URL` 时，原 static JSON registry 仍可工作。
