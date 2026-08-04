# Cloud Common Typecheck Workflow

推荐入口：

```bash
npm run typecheck:cloud
```

说明：

- 该命令只检查 `cloudfunctions/common/`
- 目标是把“本地静态噪音”和“真实云端逻辑问题”分开
- `wx-server-sdk` 通过本地声明文件兜底，避免因为运行时模块缺失淹没业务错误

改动 `cloudfunctions/common/` 后，建议顺序：

```bash
npm run typecheck:cloud
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test
```
