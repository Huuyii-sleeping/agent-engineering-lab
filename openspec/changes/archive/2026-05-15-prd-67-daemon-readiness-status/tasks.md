## 1. daemon readiness probe

- [x] 1.1 抽出可复用的 daemon service probe，统一 lock 与 client initialize 的判断
- [x] 1.2 调整 `daemon status`，在 running 时继续输出 readiness 探测结果与退出码

## 2. 验证与收口

- [x] 2.1 补充 daemon status / daemon client 单测
- [x] 2.2 更新 README / 主 spec / tasks 状态并完成 strict 验证
