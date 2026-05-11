# Release Checklist

发布前按顺序执行：

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. `npm run test:regression`
5. `npm run test:mcp`

可直接执行一键命令：

```bash
npm run release:check
```
