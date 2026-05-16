## ADDED Requirements

### Requirement: Sensitive local artifacts MUST declare retention and cleanup policy
系统 MUST 为 `.sessions`、`.transcripts`、`.memory`、`.observability`、`.security`、`.audit` 等本地持久化数据声明统一的 retention class、默认保留期与 cleanup 行为，而不是由各模块各自隐式长期保留。

#### Scenario: Cleanup job processes expired local artifacts
- **WHEN** 某类本地持久化数据超过其声明的默认保留期
- **THEN** 系统按对应 retention class 执行清理、裁剪或归档
- **AND** 清理结果可被审计

### Requirement: Sensitive local artifacts SHALL support explicit export and deletion
系统 SHALL 为高敏感本地数据提供显式导出与删除语义，避免 session、transcript、memory 或 audit 数据只能被被动累积。

#### Scenario: User deletes one retained artifact family
- **WHEN** 用户显式请求删除某个 session 或其关联 transcript / prompt dump / observability 数据
- **THEN** 系统删除对应持久化记录或标记为已清除
- **AND** 后续浏览与查询入口不再返回该数据

