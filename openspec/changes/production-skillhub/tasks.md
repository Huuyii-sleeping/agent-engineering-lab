## 1. OpenSpec 与模型

- [x] 1.1 创建 production-skillhub proposal/design/tasks
- [x] 1.2 定义 Skill Hub 生产级领域类型

## 2. BFF Skill 管理

- [x] 2.1 拆分 validator、store、installer、registry 服务
- [x] 2.2 支持 builtin、remote、custom 来源聚合
- [x] 2.3 支持 download、install、uninstall、upload API
- [x] 2.4 持久化 downloaded/installed/custom 状态

## 3. Web Skill Hub

- [x] 3.1 扩展 API client 类型和接口
- [x] 3.2 Skill Hub 展示来源、状态和下载/安装动作
- [x] 3.3 增加 custom JSON package 上传入口

## 4. Agent 配置联动

- [x] 4.1 Agent 配置页 skill 选择来源改为 installed registry
- [x] 4.2 保存 Agent 草稿时只保留已安装 skill id

## 5. 验证与交付

- [x] 5.1 补 BFF/Web 单元测试
- [x] 5.2 执行 build/test/页面验证
- [x] 5.3 完成本地提交

## 6. 远端 Registry 联合

- [x] 6.1 BFF 持久化远端 registry URL、缓存 index 和同步状态
- [x] 6.2 BFF 提供读取配置、更新配置、主动同步远端 registry API
- [x] 6.3 Web Skill Hub 提供远端地址配置和同步入口
- [x] 6.4 测试覆盖 HTTP 远端 registry 同步流程

## 7. Registry 市场元数据协议

- [x] 7.1 Registry entry 支持 publisher、source、downloads、rating、deprecated、packageSha256 字段
- [x] 7.2 BFF 下载远端 package 时校验 packageSha256
- [x] 7.3 Web Skill Hub 展示发布者、可信来源、下载量、评分和 hash 状态
- [x] 7.4 更新默认 registry 示例与单元测试
