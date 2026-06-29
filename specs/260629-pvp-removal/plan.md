# PVP 彻底移除计划

> 决策（2026-06-29）：PVP（联机派对棋盘对战）彻底弃坑、不再回头。本计划把 PVP 客户端、云函数、场景、共享类型、同步副本与相关文档一次性清干净，只保留 PVE 与共享基建。
> 不可逆性：git 保留历史可恢复；但牵涉云函数甄别与共享文件裁剪，建议**单开分支**执行，分阶段提交，每阶段后 `npm run test:pve` + 编辑器无报错再继续。
> 工程约束：云函数只改 `cloudfunctions/common/` 源头，改完跑 `node scripts/sync-cloud-common.js`；不要手改 8 份副本。

## 0. 全删 / 裁剪 / 保留 三类清单

### A. 整体删除（PVP 专属，无 PVE 依赖）

**客户端脚本**
- `assets/scripts/game/`（整目录，14 文件，PVP 棋盘客户端）
- `assets/scripts/board/`（BoardPlaceholder 等）
- `assets/scripts/settlement/`（PVP 结算）
- `assets/scripts/lobby/LobbyController.ts`（完整 PVP 大厅，**保留 PveLobbyController.ts**）
- `assets/scripts/lobby/RoomController.ts`（PVP 房间流程）
- `assets/scripts/network/GameService.ts`、`LobbyService.ts`、`GameWatcher.ts`、`GameStateMirror.ts`（**保留 CloudService.ts / PveService.ts**）

**场景**（删 .scene + .meta）
- `assets/scenes/board.scene`、`assets/scenes/settlement.scene`、`assets/scenes/lobby_pvp.scene`

**云函数**
- `cloudfunctions/game/`、`cloudfunctions/room/`、`cloudfunctions/match/`、`cloudfunctions/scheduler/`（scheduler 只跑 roomService/matchService，PVP 专属）

**common/ PVP 专属源文件**（`cloudfunctions/common/`）
- `BoardGenerator.js`、`boardRegions.js`、`BotPlayer.js`、`botNames.js`、`CellResolver.js`、`CombatResolver.js`、`EventResolver.js`、`GameEngine.js`、`ShopResolver.js`、`Settlement.js`、`finalShop.js`、`luckyRewards.js`、`luckySpin.js`、`matchService.js`、`roomService.js`、`turnDeadline.js`
- 连带 `cloudfunctions/common/__tests__/` 下对应 PVP 测试。

**共享类型**（确认后删）
- `shared/protocol.ts`（PVE 运行时未 import，仅注释引用）→ 删；若 `shared/` 仅剩 tsconfig 则连目录一并清。
- `assets/scripts/types/GameTypes.ts`（PVP 客户端协议类型）→ **先 grep 确认无 PVE 引用再删**。

### B. 裁剪（共享文件，删 PVP 部分、留 PVE/共享）

- `cloudfunctions/common/constants.js` —— **保留** `COLLECTIONS`、`PVE_DIFFICULTY_ORDER` 及任何 PVE/admin 用到的常量（`db.js`、`admin/*` 依赖）；**删除** `BOARD_SIZE` 与棋盘/战斗/商店等 PVP 常量。删后 grep 确认无残留 require。
- `cloudfunctions/initDb/index.js` —— 集合列表去掉 `rooms`、`games`；保留 `users`、`pve_saves`、`pve_balance_configs`、`admin_accounts` 等。
- `scripts/sync-cloud-common.js` ——
  - `TARGET_FUNCTIONS`：删 `'room'`、`'match'`、`'game'`、`'scheduler'`。
  - `COPY_FILES`：删上述 16 个 PVP 专属 .js，保留 `constants.js`、`id.js`、`db.js`、`index.js`、`auth.js`。
  - 删除后，把各保留云函数目录下**已存在的 PVP 副本**一并删掉（副本不会自己消失）。
- `cloudfunctions/common/index.js` —— 若 re-export 了 PVP 模块，删对应导出。
- `assets/scripts/core/SceneLoader.ts` —— 删 `loadBoard()`、`loadSettlement()`。
- `assets/scripts/core/Constants.ts` —— 删 `SCENE.BOARD`、`SCENE.SETTLEMENT`；`BOARD_SIZE` 若仅 PVP 用则删。
- `assets/scripts/platform/wechat/WxLifecycle.ts` —— **删 `import { quitGame }` 及其调用**（这是 PVE→PVP 唯一藤蔓）。

### C. 明确保留（不要碰）

- `cloudfunctions/login/`、`pve/`、`initDb/`（裁剪后）、`adminLogin/`、`adminTool/`
- `cloudfunctions/common/`：`db.js`、`auth.js`、`id.js`、`index.js`、`constants.js`（裁剪后）、`pve/**`、`admin/**`、`jest.config.js`
- 客户端：`lobby/PveLobbyController.ts`、`network/CloudService.ts`、`network/PveService.ts`、`pve/**`、`core/GameApp.ts`、`platform/**`（除 WxLifecycle 解耦）

## 1. 执行顺序（分阶段提交）

**Phase 1 — 解耦藤蔓**（先断引用，避免删文件后编译爆红）
1. `WxLifecycle.ts` 去掉 quitGame。
2. `SceneLoader.ts` 去掉 loadBoard/loadSettlement；`Constants.ts` 去掉对应 SCENE。
3. 编辑器编译通过。提交。

**Phase 2 — 删客户端 PVP**
1. 删 A 类客户端脚本目录/文件 + 三个 PVP 场景。
2. grep 确认无残留 import（`game/`、`GameService`、`LobbyService`、`GameWatcher`、`GameStateMirror`、`RoomController`、`LobbyController`）。
3. 处理 `types/GameTypes.ts` / `shared/protocol.ts`（确认无 PVE 引用后删）。
4. 编辑器编译通过、`npm run test:pve` 绿。提交。

**Phase 3 — 删/裁云函数**
1. 删 `game`/`room`/`match`/`scheduler` 云函数目录。
2. 删 common 16 个 PVP 源文件 + 对应 __tests__。
3. 裁剪 `constants.js`、`initDb`、`sync-cloud-common.js`、`common/index.js`。
4. 跑 `node scripts/sync-cloud-common.js`，删除保留云函数目录里残留的 PVP 副本。
5. `cd cloudfunctions/common && npm test` 绿（PVP 测试已移除）。提交。

**Phase 4 — 文档收口**
1. `CLAUDE.md`：删 PVP 相关说明；「8 份同名 common」警告改为只剩 PVE/共享副本的现状；目录心智模型去掉 PVP 模块。
2. `PROJECT_NAVIGATION.md`：删 §14 棋盘对战系统、§21 PVP 云函数，及顶部 PVP 注记。
3. `CALL_FLOW.md`：删 PVP 调用链章节。
4. `README.md`：文档索引去掉 PVP 行；棋盘规则相关说明。
5. `specs/260529-combat-board-game-rework/` 等 PVP specs：顶部标注「已弃坑/归档」，不必删（保留历史）。
6. 提交。

## 2. 收尾验证（DoD）

- [ ] 客户端编辑器零编译错误；`npm run test:pve` 全绿。
- [ ] `cloudfunctions/common` jest 全绿。
- [ ] 全局 grep 无 PVP 符号残留：`game/board`、`GameEngine`、`roomService`、`matchService`、`GameWatcher`、`SCENE.BOARD`。
- [ ] `node scripts/sync-cloud-common.js` 跑通，保留云函数目录下无 PVP 副本。
- [ ] 启动 → 大厅（PveLobby）→ 远征 → 结算 → 命运树 全链路可走。
- [ ] 微信构建一次，确认主包不因缺场景/缺脚本报错（PVP 场景已不在构建列表）。

## 3. 风险点

- `constants.js` 裁剪是最易出错处：`COLLECTIONS`/`PVE_DIFFICULTY_ORDER` 必须保留，删前后各 grep 一次 require 关系。
- 删场景文件后，若编辑器开着可能报「资源导入失败」——建议关编辑器删文件，再开编辑器让其重建资源库；或删后 reimport。
- `initDb` 线上若已建 `rooms`/`games` 集合，删集合定义不影响线上数据（只是不再初始化）；无需删线上集合。
