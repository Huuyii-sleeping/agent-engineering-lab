## Decisions

1. 第一阶段以 Web 前端本地状态实现 Agent Builder。
   - 理由：用户当前需要产品方向与可见体验的重心转移；在运行时协议尚未设计前，先做可操作的配置工作台能降低风险。

2. 导航模型从 `chat/settings` 扩展为 `chat/builder/settings`，但默认入口仍是 chat。
   - 理由：Builder 是可复用 agent 的子页面，不应该塞进聊天 transcript 内，也不应该在第一阶段替代原聊天首页；设置页仍保持独立全屏结构。

3. 拼装交互先用点击添加/移除，视觉上表现为可组合的构件。
   - 理由：点击交互能快速验证 IA、状态和数据模型；真正拖拽会引入排序、可访问性和移动端复杂度，适合后续独立变更。

4. Builder 数据模型拆为 catalog 与 config。
   - catalog：静态内置 skill/SOP 候选项。
   - config：用户当前 agent 名称、场景、选中 skill id、选中 SOP step id。
   - 理由：后续 catalog 可来自 BFF 或插件市场，config 可迁移到 BFF 存储。

5. 本地存储只保存稳定 id 和用户输入，不保存派生展示文本。
   - 理由：catalog 文案后续可变；保存 id 更利于版本演进。

## UI Structure

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                                                      │
│  原聊天页 + 应用生成入口 + 历史 + 设置                       │
├──────────────────────────────────────────────────────────────┤
│ Agent Builder                                                │
│ ┌──────────────┐ ┌────────────────────┐ ┌─────────────────┐ │
│ │ Skill 池      │ │ SOP 编排            │ │ Agent 预览       │ │
│ │ + browser    │ │ + 需求澄清           │ │ 名称/场景         │ │
│ │ + code       │ │ + 执行计划           │ │ 已选 skills       │ │
│ │ + memory     │ │ + 验证收口           │ │ SOP timeline      │ │
│ └──────────────┘ └────────────────────┘ └─────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Data Sketch

```ts
type AgentBuilderConfig = {
  name: string;
  scenario: string;
  selectedSkillIds: string[];
  selectedSopStepIds: string[];
};
```

## Follow-up Path

1. 拖拽排序和分组。
2. BFF 持久化 agent profiles。
3. 将配置转换为 system prompt / runtime plan。
4. 模板库、导入导出、发布和复用。
