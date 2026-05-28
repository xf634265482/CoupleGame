# cloudfunctions/common

共享源码目录（编辑这里）。**部署前**运行：

```bash
node scripts/sync-cloud-common.js
```

会将 `constants.js`、`id.js`、`db.js`、`index.js` 复制到各云函数的 `./common/`（微信部署单函数时不会上传 `../common`）。

| 文件 | 说明 |
|------|------|
| `constants.js` | 常量 |
| `id.js` | 雪花 ID |
| `db.js` | 数据库封装 |
| `index.js` | 统一导出 |
