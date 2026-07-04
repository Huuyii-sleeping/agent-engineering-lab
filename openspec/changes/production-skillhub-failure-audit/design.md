# 设计

## 数据模型

扩展 `SkillAuditEvent`：

```ts
type SkillAuditEvent = {
  ok: boolean;
  code: string;
  message: string;
  ...
}
```

成功事件：

- `ok: true`
- `code: ""`
- `message: ""`

失败事件：

- `ok: false`
- `code`: BFF 错误码
- `message`: 可读失败原因

## 写入位置

失败审计由 `SkillsController` 在返回错误前写入，因为 controller 最清楚本次 HTTP 响应错误码和用户看到的 message。

成功审计继续由 `SkillRegistryService` 在 lifecycle 操作成功后写入。

## Web 展示

详情面板审计事件展示：

- 成功事件：动作、版本、状态、时间。
- 失败事件：动作失败、错误码、失败原因、时间。

## 风险

- 审计写入失败会让请求失败，符合“失败要明确可见”的规则。
- 失败事件无法展示精确版本时，版本显示为“无”。
