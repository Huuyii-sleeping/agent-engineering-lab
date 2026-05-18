# PRD-67 Skills 实现链路增强与安全边界

## 背景

本 PRD 对照 `liuup/claude-code-analysis` 的 `analysis/04c-skills-implementation.md`，只聚焦 Skills 机制。当前仓库已有本地 `SKILL.md` 递归发现、`AGENT_SKILLS` 加载、prompt 导出、`list_skills` 和 `load_skill` 工具，但实现仍偏轻量：frontmatter 只支持简单字符串，技能来源和信任边界不清晰，路径条件、模型偏好、允许工具、变量展开和内嵌 shell 安全策略没有成为一等能力。

## 目标

- Skills loader 解析结构化元数据：`name`、`description`、`allowed-tools`、`model`、`paths`、`source`。
- Skills catalog 暴露治理字段：来源类型、允许工具、路径条件、模型偏好、是否包含 shell 片段、是否允许 shell。
- `load_skill` 返回经过受控变量展开的内容，支持 `${SKILL_DIR}` 和 `${SESSION_ID}`。
- 支持按路径上下文筛选技能，为后续自动激活和上下文裁剪留接口。
- MCP/remote 来源技能默认只读加载，禁止 shell 执行能力。
- 保持现有本地技能加载、prompt 注入和工具兼容。

## 当前缺口

- `parseFrontmatter()` 只解析 `key: value`，不支持逗号列表或 YAML list。
- `SkillDefinition` 只有 `metadata: Record<string,string>`，缺少 typed metadata。
- `list_skills`/`load_skill` 没有返回 `sourceType`、`allowedTools`、`model`、`paths`、`canRunShell` 等治理信息。
- `toPromptSkillBlocks()` 直接拼接正文，没有说明技能来源和约束。
- 技能正文中的 `${SKILL_DIR}`、`${SESSION_ID}` 不会展开。
- 不能判断技能是否适用于当前路径上下文。
- 远程/MCP 技能与本地项目技能没有明确安全差异。

## 范围

In scope:
- 扩展 loader 类型和 frontmatter 解析能力。
- 增加 `expandSkillContent()`、`skillMatchesPaths()`、`selectSkillsForContext()`。
- 增加 shell fence 检测和 `canRunShell` 派生策略。
- 更新 `list_skills` 和 `load_skill` 输出。
- 更新 prompt skill block，包含 compact metadata header。
- 增加单元测试覆盖结构化元数据、路径匹配、变量展开和工具输出。

Out of scope:
- 不直接新增通用 `run_skill_command` 执行工具。
- 不从网络或 MCP server 自动安装技能。
- 不引入完整 YAML parser 或 glob 依赖。
- 不实现模型级技能自动路由，只暴露 `model` 元数据。

## 验收标准

- AC-1：frontmatter 中的 `allowed-tools` 和 `paths` 支持逗号列表与 YAML list。
- AC-2：`source: mcp` 或 `source: remote` 的技能 `canRunShell=false`，即使正文包含 shell fence。
- AC-3：本地可信技能只有显式声明 shell/bash/powershell 类 allowed tool 时才 `canRunShell=true`。
- AC-4：`expandSkillContent()` 正确展开 `${SKILL_DIR}` 和 `${SESSION_ID}`。
- AC-5：`skillMatchesPaths()` 能匹配 `apps/**`、`src/*.ts`、精确路径和无路径条件的技能。
- AC-6：`list_skills`/`load_skill` 输出治理字段且保持现有调用兼容。
- AC-7：相关单元测试和 TypeScript build 通过。

## 保留缺口

- 完整 YAML 语义、复杂 glob 语法、远程技能签名校验、技能包版本锁定暂不实现。
- 技能命令执行暂不开放独立工具；后续如要实现，必须接入现有 security gate 并默认拒绝 MCP/remote 来源。
