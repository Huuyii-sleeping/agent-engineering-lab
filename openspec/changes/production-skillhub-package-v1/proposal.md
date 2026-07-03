# production-skillhub-package-v1

## Why

当前 SkillHub 已能通过 JSON package 打通 registry、下载、安装和上传链路，但包格式仍偏演示：没有显式 schema version，没有标准化权限声明入口，对可选文档和示例目录没有清晰约束，也没有重复路径等基础一致性校验。后续要继续做鉴权、签名、审核和升级回滚，必须先把包模型稳定下来。

## What Changes

- 定义第一版生产包协议 `skillPackageVersion: "1.0"`。
- 保持现有 `{ files: [...] }` JSON package 兼容，未声明版本时按 legacy package 处理。
- 扩展 package validator：
  - 校验 `skillPackageVersion` 只允许缺省或 `"1.0"`；
  - 拒绝重复文件路径；
  - 允许 `README.md`、`permissions.json`、`examples/**` 等非执行型文件；
  - 对 `permissions.json` 做 JSON 对象校验，并要求其中声明的权限覆盖 `skill.json.permissions`；
  - 继续禁止 `scripts/**` 和不安全路径。
- BFF 和 standalone registry service 使用一致的包校验语义。
- 补充单元测试覆盖 package v1、legacy 兼容和非法包拒绝。

## Non-Goals

- 本阶段不实现 admin 鉴权、发布审核、签名验签、zip/tar 解包。
- 本阶段不改 Web SkillHub 页面结构。
- 本阶段不改 Agent skill binding 的版本锁定模型。

## Acceptance Criteria

- legacy JSON package 仍可被远端下载、上传和安装。
- `skillPackageVersion: "1.0"` package 可通过 BFF 上传和 registry publish。
- 重复路径、未知 package version、无效 `permissions.json` 会被拒绝并返回可读错误。
- `pnpm` 相关等价命令的单测和构建通过。
