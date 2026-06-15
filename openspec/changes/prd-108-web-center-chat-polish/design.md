## Decisions

1. 运行状态由 Web 已有状态推导。
   - `loadState === "loading"` 显示 `loading`。
   - `isBusy` 显示 `running`。
   - 有 active session 时显示 `completed`。
   - 无 active session 时显示 `idle`。

2. 空会话使用居中大标题，不展示工程说明。
   - 理由：用户希望参考豆包的新建对话视觉，减少 BFF/agent service 等工程文案。

3. 输入框快捷键先展示为 keycap 提示。
   - 理由：这轮是界面优化，保持发送行为稳定；后续可再扩展实际快捷键面板。

4. 输入框 focus 不再改变边框颜色或外发光。
   - 理由：避免当前绿色边框打断整体视觉。
