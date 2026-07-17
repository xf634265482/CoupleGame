# cloudfunctions 云函数指南

## 唯一共享源

`cloudfunctions/common/` 是共享逻辑的唯一权威源。`login`、`pve`、`initDb`、`adminLogin`、`adminTool` 下的 `common/` 都是同步副本，禁止直接编辑。

修改共享代码后运行：

```bash
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test
```

单个云函数自己的 `index.js` 可以直接修改，不需要同步。

## 当前 PVE 云端职责

- `pve/PveProfile.js`：玩家永久档案。
- `pve/PveStamina.js`：体力恢复与逐层挑战扣费。
- `pve/PveChallenge.js`：楼层挑战生命周期。
- `pve/PveProgression.js`：永久逐层进度。
- `pve/PveMinghen.js`：命痕数据。
- `pve/PveCamp.js`：营地状态。
- `pve/PveBalance.js`：当前数值配置。

测试位于 `cloudfunctions/common/__tests__/`。数据库集合定义以 `cloudfunctions/common/constants.js` 和 `cloudfunctions/initDb/index.js` 为准。
