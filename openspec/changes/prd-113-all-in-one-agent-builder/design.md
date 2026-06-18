## Decisions

1. 第一阶段以 Web 前端本地状态实现 Agent Builder。
   - 理由：用户当前需要产品方向与可见体验的重心转移；在运行时协议尚未设计前，先做可操作的配置工作台能降低风险。

2. 导航模型从 `chat/settings` 扩展为 `landing -> workspace tabs -> settings`。
   - 理由：项目需要一个主介绍页表达定位；进入后再用 Tab 区分 Agent 测试、Skill 加载和未来能力。设置页仍保持独立全屏结构。

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
│ Landing                                                      │
│  AI Studio intro + 立即开始                                  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Sidebar + Workspace Tabs                                     │
│  [Agent 测试] [Skill 加载]                                   │
├──────────────────────────────────────────────────────────────┤
│ Agent 测试: 原聊天页                                         │
│ Skill 加载: SkillHub cards + 下载状态                        │
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

type SkillHubState = {
  downloadedSkillIds: string[];
};
```

## Follow-up Path

1. 继续补齐未命名的后续 Tab。
2. 拖拽排序和 SOP 分组。
3. BFF 持久化 skill 下载与 agent profiles。
4. 将配置转换为 system prompt / runtime plan。
5. 模板库、导入导出、发布和复用。
