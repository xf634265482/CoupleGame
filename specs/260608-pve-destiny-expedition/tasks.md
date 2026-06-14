# PVE「命运远征」M1 垂直切片 - 任务清单

> 每个任务可独立执行，可交给单独的 Claude 进程。
> 计划参考：根计划文件 `d-desktop-pve-txt-pve-cocos2d-valiant-shore.md`；玩法参考：`specs/260608-pve-destiny-expedition/design.md`；编码规范：`.cursor/rules/pve-module.mdc`。
> M1 范围：第一章（1~5 层）核心循环端到端打通，覆盖 AC-1～AC-14。

---

## 阶段 P0 — 文档与脚手架 ✅

- [x] **Task 0.1** 形式化玩法主文档 `specs/260608-pve-destiny-expedition/design.md`（含 AC-1～AC-20）
- [x] **Task 0.2** PVE 编码规范 `.cursor/rules/pve-module.mdc`
- [x] **Task 0.3** 核心骨架：`pve/core/rng.ts`、`PveConstants.ts`、`PveTypes.ts`
- [x] **Task 0.4** ts-jest 脚手架：`jest.config.js`、`tsconfig.jest.json`、`test/pve/rng.test.ts`，`npm run test:pve` 通过
- [x] **Task 0.5** 数据库字段说明 `ddl-sql.md`

---

## 阶段 P1 — 核心逻辑（纯逻辑 + ts-jest，逐模块 TDD，零 cc 依赖）

> 全部位于 `assets/scripts/pve/core/`，测试位于 `test/pve/`。每个模块输入输出纯函数，用 `rng.ts` 取随机。

### Task 1.1 - `MapGenerator.ts`（→ AC-1, AC-8, AC-9）
- 产出：`generateFloor(floor, seed): FloorState`
- 8×8 普通层 / 10×10 Boss 层；放置玩家出生点、普通怪×N、宝箱、钥匙、出口门；Boss 层放 Boss 替代出口门。
- 实体不重叠；钥匙与出口门有合理间距；初始 `revealed` 全 false，仅揭示出生点半径。
- 单测：尺寸正确、实体数量/类型、无重叠、同种子可复现、Boss 层含 Boss+钥匙。

### Task 1.2 - `FogSystem.ts`（→ AC-1）
- 产出：`reveal(state, center, radius): Coord[]`（返回新揭示格）。
- 曼哈顿半径 `FOG_REVEAL_RADIUS`；越界裁剪；已揭示不重复返回。
- 单测：边角揭示数量、半径正确、幂等。

### Task 1.3 - `ApSystem.ts`（→ AC-2, AC-3）
- 产出：`rollAp(rng): {dice, ap}`（`AP=8+dice`）、`canAfford(ap, cost)`、`spend(ap, cost)`。
- 单测：AP 范围 9~14、各行动消耗、AP 不足拒绝。

### Task 1.4 - `MovementSystem.ts`（→ AC-2, AC-3）
- 产出：`applyMove(state, dir|targetCell): ApplyResult`，扣 2 AP，更新位置，触发迷雾揭示事件；AP 不足或越界拒绝。
- 单测：合法移动扣 AP、揭示事件、越界/AP 不足拒绝。

### Task 1.5 - `CombatSystem.ts`（→ AC-5）
- 产出：`playerAttack(state, monsterId): ApplyResult`，校验攻击距离（曼哈顿）、扣 1 AP、结算伤害、怪物 HP<=0 标记 DEAD 并触发 KILL；`monsterAttack(state, monsterId): ApplyResult` 对玩家造成伤害，HP<=0 触发 PLAYER_DEAD。
- 伤害用职业/装备加成（M1：冒险者基础值 + `CLASS_STATS`）。
- 单测：距离校验、伤害值、击杀事件、玩家死亡事件。

### Task 1.6 - `MonsterAI.ts`（→ AC-4）
- 产出：`stepMonsters(state): ApplyResult`，普通怪：警戒范围内发现玩家→朝玩家移动→进范围则攻击；范围外 IDLE。
- 单测：发现追击、进范围攻击、范围外不动；确定性。

### Task 1.7 - `LootSystem.ts`（→ AC-6）
- 产出：`rollNormalMonsterDrop(rng)`、`openChest(state, entityId): ApplyResult`（扣 1 AP）。
- 普通怪掉落 50%/25%/25%（金币/灵气/金币+灵气）。
- 单测：掉落概率分布（大样本）、金币/灵气区间、宝箱开启一次性。

### Task 1.8 - `AnimaSystem.ts`（→ AC-7）
- 产出：`addAnima(state, amount): ApplyResult`，累计满 100 触发 `ANIMA_STRENGTHEN`（3 选 1）；`applyStrengthen(state, traitId)`。
- M1 给少量基础强化词条池。
- 单测：满 100 触发、进度归零累计、3 选 1 来自池、选择生效。

### Task 1.9 - `FloorRules.ts`（→ AC-8, AC-9）
- 产出：`pickKey`、`openExit`（普通层需 hasKey）、Boss 击败后 `spawnPortal`、`isFloorCleared`。
- 单测：无钥匙不能开出口、有钥匙通关、Boss 层击败→传送门→通关。

### Task 1.10 - `bosses/GoblinChief.ts`（→ AC-10）
- 产出：哥布林酋长专属机制（M1 可为高 HP + 周期强力攻击）；必掉装备钩子。
- 单测：机制触发、必掉装备。

### Task 1.11 - `ExpeditionState.ts`（→ AC-11, AC-12, AC-13）
- 产出：`startExpedition(runSeed)`、`endTurn(state): ApplyResult`（重掷 AP、推进怪物、回合+1）、`advanceFloor(state)`（生成下一层）、`serialize`/`deserialize`、`applyDeath`（清空局内、保留局外）。
- 单测：存档序列化往返一致、续玩从下一层、死亡清空/保留正确、同种子+同操作序列结果一致。

---

## 阶段 P2 — 客户端场景与表现

### Task 2.1 - 场景与入口
- `assets/scenes/pve_expedition.scene`；`SceneLoader.loadPveExpedition()`；`Constants.SCENE.PVE_EXPEDITION`；`LobbyController` 新增「命运远征」入口按钮。

### Task 2.2 - `views/FogMapView.ts`
- 网格 + 迷雾 + 实体渲染；节点池化（预建格子数组）+ diff 刷新（参考 `BoardView`）。

### Task 2.3 - `views/PveHudView.ts`
- AP / HP / 金币 / 灵气 / 回合 / 结束回合按钮；参考 `HudController` 代码建 UI + 回调。

### Task 2.4 - `controllers/ExpeditionController.ts`
- 编排：输入（点击格子移动/攻击/交互）→ core 纯函数 → 按 `PveEvent` 回放动画 → 刷新 View；`_busy` 守卫；`onDestroy` 清理。

### Task 2.5 - `views/PveToastView.ts`
- 战斗 / 拾取 / 灵气强化 3 选 1 弹窗。

---

## 阶段 P3 — 网络与存档

### Task 3.1 - `cloudfunctions/pve/index.js` + `common/pve/*`
- action：`loadSave` / `saveFloor` / `settleRun`；`PveSave.js` / `PveReward.js` / `PveValidate.js`；登记 `scripts/sync-cloud-common.js`。

### Task 3.2 - `net/PveService.ts`
- 客户端封装 `loadSave`/`saveFloor`/`settleRun`（`CloudService.callFunction('pve', …)`）。

### Task 3.3 - 存档接入
- `pve_saves` 集合；`users` 元字段；每层完成自动存档；返回大厅续玩从下一层；奖励边界校验入账（→ AC-14）。

---

## 阶段 P4 — 测试与验收

### Task 4.1 - 单测全绿 ✅ 完成（2026-06-08）
- `test/pve/*.test.ts` 覆盖地图/AP/移动/战斗/AI/掉落/灵气/通关/存档往返（含 resumeExpedition↔advanceFloor 交叉一致性）；`npm test` 100/100 通过。
- `cloudfunctions/common/__tests__/pve.test.js` 新增 13 例（PveValidate 连续性/种子校验 + PveReward 边界计算）；`cloudfunctions/common` 套件 94/94 通过。

### Task 4.2 - AC 走查 ✅ 完成（2026-06-08，代码审查口径）
- `acceptance-checklist.md` 已记录 AC-1～AC-14 结论：13 项 ✅（单测 + 端到端代码审查核对 core→Controller→View/云函数调用链路闭合），AC-13 此前已通过。
- 真机/开发者工具的视觉效果、手感、网络异常分支走查移交 Task 4.3（不阻塞本表 M1 结论）。

### Task 4.3 - 真机美术与联调（待开始）
- M1 当前**无美术资源**（`FogMapView` 用 Graphics 色块 + Label 文字占位渲染，见 [FogMapView.ts:4](../../assets/scripts/pve/views/FogMapView.ts:4)），暂无新图标/贴图需要进 `UiAssets.ts` 主包 critical native；本任务收窄为：开发者工具/真机联调占位渲染下的迷雾揭示、AP 行动、追击战斗、宝箱/钥匙/出口、灵气强化、Boss、自动存档与续玩、结算奖励到账（参考 `.cursor/rules/cocos-wechatgame-subpackage.mdc` 自检清单）。
- 待真正美术资源就绪后，再执行「压缩 → patch → 真机验证」流程并回写本任务。

---

## 任务概要

| 阶段 | 任务数 | 覆盖 AC |
|------|--------|---------|
| P0 文档与脚手架 | 5 | — |
| P1 核心逻辑 | 11 | AC-1～AC-13 |
| P2 客户端表现 | 5 | AC-1～AC-10 展示侧 |
| P3 网络与存档 | 3 | AC-11, AC-14 |
| P4 测试与验收 | 3 | AC-1～AC-14 |
