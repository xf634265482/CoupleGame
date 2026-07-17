# 普通层地形 + 掩体 LOS 实施计划

> 设计：本目录 `design.md`（唯一真相源，实现前必读）。
> 工程约束：`pve/core/` 零 `cc` 依赖、禁裸 `Math.random()`（用 `core/rng.ts`）；单测在根 `test/pve/`，跑 `npm run test:pve`；地形生成与 LOS 必须确定性可复算（AC-13）。
> 章内节拍依据 `specs/260628-progression-pacing-v3/design.md` §2.2（7 层/章）。

按 Phase 顺序，每阶段独立验收、独立提交。

---

## Phase 1 — 普通层地形生成（层一，先见效）

1. `PveConstants.ts`：新增每章普通层地形配置——调色板（章→地形类型）、章内节拍强度（章内层→数量区间）。首发参考：1-2 层 3-5、第 3 层中等、4-6 层 8-12；危险度按章递增（第 1 章无伤，LAVA_TILE 仅第 4 章起进普通层）。
2. `MapGenerator.ts`：在**非 Boss 分支**加「普通层地形生成 pass」：
   - 按 `(chapter, 章内层号)` 查调色板与强度，从 `pool` 取空格放地形，走 `rng`。
   - **可解性校验**：放完后确认 钥匙、出口门 从玩家初始位置可达（连通性 BFS）；不通则回退该地形或重放，阻挡型密度设上限。
3. `MovementSystem.ts`：把沙坑 +AP、冰面滑行、熔岩踩入扣血等**从「Boss 房专属/`chapter===N`」条件泛化**到普通层（现有 SAND_PIT penalty 等可能带 Boss 房判断，需放开）。墙体阻挡复用现有 `isBlockedByRock`/`isBlockedByIceWall`。
4. `FogMapView.ts`：普通层地形渲染，复用各 chapter bundle 已有地形贴图（`getCachedSprite`）。
5. 测试：地形可解性校验单测、确定性回归（同 seed 同布局）。
6. 校验 `npm run test:pve` 绿；编辑器/预览看普通层不再空旷。提交。

**Phase 1 验收**：AC-MT-1、AC-MT-2、AC-MT-3。

---

## Phase 2 — 掩体视线 LOS（层二，灵魂）

1. `PveTypes.ts`：`FixedEntity` 增 `blocksLineOfSight?`（或按 type 静态推导）；新增事件 `ATTACK_BLOCKED_BY_COVER`。
2. `PveConstants.ts`：`BLOCKS_LOS_TYPES` 集合 = {ROCK, ICE_WALL, FREEZE_WALL}（地面型不入）。
3. LOS 工具（`pve/core/` 新函数，纯几何）：Bresenham 直线，判定经过格是否有挡视线地形。规则朴素固定，写进单测锁定行为。
4. `CombatSystem.ts`：
   - 玩家攻击（约 :299）：range≥2 时，距离通过后再做 LOS 校验，被挡则不打出并 emit `ATTACK_BLOCKED_BY_COVER`。
   - 怪物攻击（约 :796）：同样加 LOS 校验。
   - 近战（range=1）不走 LOS。
5. 反馈：`ExpeditionController._replayEvents` 处理 `ATTACK_BLOCKED_BY_COVER` → 战报/轻提示「被遮挡」。
6. 测试：LOS 判定单测（含对角线 case 固定预期）、玩家/怪物对称性、近战不受影响。
7. 校验绿。提交。

**Phase 2 验收**：AC-MT-4、AC-MT-5、AC-MT-7、AC-MT-8。

---

## Phase 3 — AI 与打磨

1. `MonsterAI.ts`：远程怪攻击决策（约 :510）——有视线才攻击；无视线时继续移动找射界（复用追击逻辑），不站桩空放。
2. 玩家远程选目标 UI：被掩体挡的目标明示不可达 / 尝试时提示。
3. 密度与强度玩测微调（地形数量、可解性上限），必要时调 Phase 1 参数。

**Phase 3 验收**：AC-MT-6，以及整体手感玩测。

---

## 收尾

- 同步 `specs/260608-pve-destiny-expedition/design.md`（§5 地图系统 / §11b 地形：补「普通层地形」与「掩体 LOS」）。
- 如 PROJECT_NAVIGATION.md 的地图/战斗入口因新增 LOS 工具失准，一并更新。

## 风险

- grid-LOS 对角线判定易出诡异 case：选一种 Bresenham 规则并用单测固定，不要凭直觉改。
- 地形泛化到普通层时注意现有「Boss 房专属」分支（沙坑 penalty、潜地扩张等）不要误触发到普通层 Boss 机制。
- 可解性校验必须覆盖「阻挡型地形 + 怪物占位」叠加后仍连通。
