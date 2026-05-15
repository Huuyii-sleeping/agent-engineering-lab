## 1. daemon 生命周期修正

- [x] 1.1 调整 daemon 启动流程，使锁覆盖后台进程实际存活期而不是只覆盖启动瞬间
- [x] 1.2 为 daemon 增加基于 server close 和进程信号的优雅退出路径

## 2. 本地控制面

- [x] 2.1 增加 `agent-cli daemon stop` 子命令与停止结果输出
- [x] 2.2 更新 CLI dispatcher 和相关帮助文案，使 daemon 控制命令可发现

## 3. 验证与文档

- [x] 3.1 补充 daemon lifecycle、stop、dispatcher 相关单测
- [x] 3.2 更新 README / spec / tasks 状态，并完成本轮验证
