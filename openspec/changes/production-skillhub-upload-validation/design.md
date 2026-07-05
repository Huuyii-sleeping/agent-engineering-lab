# 设计

## 校验函数

在 SkillHubPage 模块中新增可测试纯函数：

```ts
validateSkillPackageInput(input: unknown): string | null
```

返回：

- `null`：可提交。
- `string`：用户可读错误。

## 校验规则

- 输入必须是对象。
- `files` 必须是非空数组。
- 每个文件必须是对象。
- 每个文件必须有非空 `path`。
- 每个文件必须有字符串 `content`。
- 必须包含 `SKILL.md`。
- 必须包含 `skill.json`。

路径比较会去掉前导 `./`，避免用户按常见相对路径写法上传时被误判。

## UI 行为

`handleUpload()` 先解析 JSON，再调用校验函数：

- JSON 解析失败：显示原有 JSON 错误。
- 结构校验失败：显示具体错误。
- 校验通过：调用 `onUploadPackage()` 并清空输入。

## 风险

- 前端只做轻量结构校验，最终可信校验仍在后端。
- 本阶段不深入解析 YAML 或 JSON 内容，避免把业务规则重复散落到前端。
