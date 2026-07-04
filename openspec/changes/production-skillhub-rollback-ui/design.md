# 设计

## 页面模型

沿用 `SkillRegistryItem.previousInstalledVersion` 表示回滚目标版本。页面只在满足以下条件时显示回滚入口：

- `skill.installed === true`
- `skill.previousInstalledVersion` 非空

这样可以避免对没有本地上一版本的 Skill 展示无效操作。

## 交互

SkillHub 卡片保留主按钮语义：

- `available`：下载
- `downloaded`：安装
- `updateAvailable`：升级
- `installed`：已安装/卸载路径

新增一个次级按钮：

```text
回滚到 v<previousInstalledVersion>
```

点击后调用独立回调 `onRollbackSkill(skill)`，由 App 负责调用 API 并更新 registry。回滚失败继续复用现有全局错误展示。

## 为什么独立回调

`onSkillAction()` 当前承担主按钮状态机。回滚是次级诊断/恢复动作，如果塞进同一个函数，需要在页面内部隐式改变主按钮含义，容易让“已安装”按钮到底是卸载还是回滚变得不清晰。

独立回调让页面表达更明确：

- 主按钮继续管理安装生命周期。
- 次级按钮只处理版本恢复。

## 风险

- 回滚依赖本地旧版本 package 仍存在；BFF 返回失败时 Web 不吞错，继续展示错误。
- 如果回滚后还有可升级版本，BFF 返回的 `status` 可能仍是 `updateAvailable`，页面按返回状态展示。
