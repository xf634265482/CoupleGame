# cloudfunctions/ — 云函数指南

## 关键规则：common 是唯一源头

```
cloudfunctions/
  common/              ← ★ 唯一权威源，所有共享逻辑只改这里 ★
  login/  room/  match/  game/  pve/  initDb/  scheduler/
    └─ common/         ← 自动同步副本，禁止手改
```

微信部署单个云函数时不会带兄弟目录 `../common`，所以 `scripts/sync-cloud-common.js` 把 `cloudfunctions/common/` 的文件复制到每个云函数自己的 `./common/`。

**直接编辑副本会被下次 sync 静默覆盖，丢失修改。**

## 工作流

修改共享逻辑（如 `GameEngine.js` / `CellResolver.js` / `Settlement.js` / `pve/PveValidate.js` 等）：

1. 改 `cloudfunctions/common/<file>.js`
2. `node scripts/sync-cloud-common.js`
3. 微信开发者工具 → 云开发 → 云函数 → 右键目标函数 → **创建并部署：云端安装依赖**

修改单个云函数自己的 `index.js`（如 `cloudfunctions/pve/index.js`）：直接改，不需要 sync。

## 搜索建议

Grep 这个目录时一定要排除副本，不然每个名字会命中 8 次：

```
--glob '!cloudfunctions/*/common/**'
```

或者直接把路径限定到 `cloudfunctions/common/` + 各云函数的 `index.js`。

## 测试

```bash
cd cloudfunctions/common && npm test
```

测试在 `cloudfunctions/common/__tests__/`，覆盖 `GameEngine` / `Settlement` / `BoardGenerator` / `pve/PveValidate` / `pve/PveReward` 等。

## 同步清单

`scripts/sync-cloud-common.js` 顶部的 `COPY_FILES` 和 `COPY_SUBDIR_FILES` 数组决定哪些文件会被分发。新增共享文件时需要把文件名加进去。

## 子目录用途

| 函数 | 干什么 |
|------|--------|
| `login` | OPENID 登录、用户初始化 |
| `room` | 房间创建/加入/退出 |
| `match` | 匹配 |
| `game` | PVP 棋盘对战核心（回合/掷骰/落子/结算） |
| `pve` | PVE 存档 + 结算校验（action: loadSave/saveFloor/settleRun/unlockTreeNode） |
| `initDb` | 集合初始化 + 索引 |
| `scheduler` | 定时任务（如 turnDeadline） |

云数据库集合定义见 `cloudfunctions/initDb/index.js` 的 `COLLECTIONS`。
