# 普通层地形 + 掩体视线（LOS）系统

> 状态：设计待评审
> 关联：`assets/scripts/pve/core/MapGenerator.ts`、`PveTypes.ts`、`PveConstants.ts`、`MovementSystem.ts`、`CombatSystem.ts`、`MonsterAI.ts`、`assets/scripts/pve/views/FogMapView.ts`
> 依赖节拍：章内节拍以 `specs/260628-progression-pacing-v3/design.md` §2.2 为准（7 层/章，章内第 3 层精英、4-6 机关主场）。
> 玩法主文档：落地后同步 `specs/260608-pve-destiny-expedition/design.md`（§5 地图系统 / §11b 地形）。

## 0. 背景与问题

普通层目前**没有任何地形**——地形（ROCK/SAND_PIT/ICE_WALL/ICE_TILE/LAVA_TILE）只在 `MapGenerator` 的 `isBossFloor` 分支生成（`MapGenerator.ts:159`）。普通层是空地 + 孤立实体，揭开格里约只有 20% 有内容，走空格无趣味。

同时，远程攻击是**纯曼哈顿距离判定、无视线遮挡**（`CombatSystem.ts:299` 玩家 / `CombatSystem.ts:796` 怪物），ROCK 只挡移动与 Boss AOE，**不挡单体远程**——所以即使铺了地形，「躲掩体避箭」也不成立。

本设计分两层解决：**① 普通层地形生成**（治空旷、强化章节辨识）；**② 掩体视线机制**（让地形成为真正的战术掩体，是趣味性的灵魂）。②是真机制改动，缺了它①只好看不好玩。

## 1. 层一：普通层地形生成

### 1.1 原则

- **加密度不加尺寸**：地图尺寸不变（普通 8×8 / 高层 9×9；视口锁 ~5.5 格，放大只会增加滚动与走空格）。目标：揭开格**约 30-40% 有内容**（实体 or 地形）。
- **确定性**：地形生成走 `core/rng.ts`，同 seed 同结果（AC-13 不破）。
- **可解性铁律**：放完地形必须保证 钥匙、出口门 从玩家初始位置可达；阻挡型地形密度设上限，必要时按连通性校验回退/重放。

### 1.2 每章地形调色板（复用现有类型 + 美术）

| 章 | 地形 | 作用 | 危险度 | 挡视线 |
|---|---|---|---|---|
| 1 哥布林 | ROCK | 掩体 / 障碍绕路 | 无伤 | ✅ |
| 2 沙漠 | SAND_PIT | 踩入 +AP（捷径 vs 绕路） | 无伤 | ❌ 地面型 |
| 3 冰原 | ICE_WALL（可破坏）+ ICE_TILE（滑行） | 阻挡 + 打断走位 | 无伤 | 墙✅ / 冰面❌ |
| 4 熔岩 | LAVA_TILE | 踩入扣血的危险区 | **有伤** | ❌ 地面型 |
| 5 命运 | 封锁/虚空格（沿用或轻量新增） | 周期封锁 / 走位限制 | 视设计 | 视类型 |

> **危险度按章递增**：第 1 章只给无伤掩体（呼应新手别翻车，见 progression-pacing-v3 §4b），扣血型熔岩留到第 4 章玩家装备成型时。

### 1.3 强度跟随章内节拍

| 章内层 | 地形强度 |
|--------|----------|
| 1-2 探索铺垫 | 稀疏（约 3-5 块，以掩体为主） |
| 3 精英关卡 | 中等掩体（让走位有意义） |
| 4-6 机关主场 | 密集（约 8-12 块，本章 gimmick 全开） |
| 7 Boss | 现有 Boss 房地形（不变） |

（数量为首发参考值，待玩测/密度模拟微调。）

## 2. 层二：掩体视线（LOS）机制

### 2.1 规则

- **`blocksLineOfSight` 属性**：墙体地形（ROCK / ICE_WALL / FREEZE_WALL）挡视线；地面型（SAND_PIT / ICE_TILE / SHATTERED_ICE / LAVA_TILE）不挡。怪物/Boss 本身是否挡视线默认**不挡**（避免规则过复杂），仅地形挡。
- **远程攻击（range ≥ 2）需视线**：攻击者与目标格之间的直线若经过挡视线地形，则该次攻击**被遮挡、打不出**。
- **近战（range = 1）不受影响**：相邻无可挡的中间格。
- **对称生效**：玩家射手（range≥2）与怪物弓箭手（如哥布林弓箭手 range 3）同规则——玩家能躲掩体，也要绕出掩体才能输出。
- **视线算法**：用 Bresenham 直线，判定经过的格里是否有 `blocksLineOfSight` 地形。规则要**朴素可预测**，宁可简单也要玩家一眼看懂（grid-LOS 对角线 case 多，统一一种判定，写进测试固定行为）。
- **确定性**：纯几何，AC-13 不破。

### 2.2 AI 配合

- 远程怪没视线时**不空放**：复用现有追击逻辑继续移动，直到取得视线或进入近战；不得站着干瞪眼。
- Boss 的 AOE/技能预警是否受 LOS 影响**不在本期改**（维持现有 Boss 房行为），本期 LOS 只作用于**单体远程普攻**。

### 2.3 反馈（必须有）

- 被掩体挡掉的远程攻击 emit 新事件（如 `ATTACK_BLOCKED_BY_COVER`），战报 + 轻提示告知「被遮挡」，否则玩家会以为是 bug。
- 玩家选择远程目标时，若被掩体挡，UI 应明示不可达（或在尝试时给「被遮挡」提示）。

## 3. 连带改动清单

- `PveTypes.ts`：`FixedEntity` 增 `blocksLineOfSight?`（或按 type 静态推导）；新增 `ATTACK_BLOCKED_BY_COVER` 事件类型。
- `PveConstants.ts`：每章普通层地形数量/节拍参数；`BLOCKS_LOS_TYPES` 集合。
- `MapGenerator.ts`：在非 Boss 分支加「普通层地形生成 pass」（按章调色板 + 节拍强度）；加可解性/连通性校验。
- `MovementSystem.ts`：复用现有 `isBlockedByRock`/`isBlockedByIceWall`；普通层沙坑/冰面/熔岩的踩入效果需脱离「Boss 房专属」判断，使其在普通层也生效（注意现有沙坑 penalty 等可能带 `chapter===2 Boss房` 条件，要泛化）。
- `CombatSystem.ts`：玩家攻击（:299）与怪物攻击（:796）的 range 判定后**增加 LOS 校验**（range≥2 时）。
- `MonsterAI.ts`：远程怪攻击决策（:510 一带）加「有视线才攻击，否则继续移动找射界」。
- `FogMapView.ts`：普通层地形渲染（章节贴图已在各 chapter bundle，复用 `getCachedSprite`）；被遮挡提示表现。
- 测试 `test/pve/`：LOS 判定单测（固定 Bresenham 行为）、地形可解性校验、确定性回归。

## 4. 验收标准（AC）

- [ ] [AC-MT-1] 普通层按章调色板生成地形，强度随章内节拍 1-2 稀疏 / 3 中等 / 4-6 密集；揭开格内容占比 ~30-40%。
- [ ] [AC-MT-2] 任意生成结果，钥匙与出口门从玩家初始位置可达（可解性校验通过）；同 seed 同结果。
- [ ] [AC-MT-3] 危险度按章递增：第 1 章地形无伤；扣血型（LAVA_TILE）仅第 4 章起出现于普通层。
- [ ] [AC-MT-4] 远程攻击（range≥2）被 `blocksLineOfSight` 地形遮挡时打不出；近战不受影响；玩家与怪物对称生效。
- [ ] [AC-MT-5] 地面型地形（沙坑/冰面/熔岩）不挡视线；墙体（ROCK/ICE_WALL/FREEZE_WALL）挡视线。
- [ ] [AC-MT-6] 远程怪无视线时继续移动找射界，不空放站桩。
- [ ] [AC-MT-7] 被遮挡的攻击有战报/提示（`ATTACK_BLOCKED_BY_COVER`），玩家可理解。
- [ ] [AC-MT-8] LOS 为纯几何确定性，云端可复算（AC-13 不破）。

## 5. 实施分期

- **Phase 1 — 地形生成（层一，先见效）**：MapGenerator 普通层地形 pass + 调色板 + 节拍强度 + 可解性校验 + 渲染。此阶段地形仅有移动/踩入效果（沙坑/冰面/熔岩泛化到普通层），尚无 LOS。
- **Phase 2 — 掩体 LOS（层二，灵魂）**：`blocksLineOfSight` + 远程攻击 LOS 校验（玩家+怪物）+ Bresenham 判定 + 单测 + 被遮挡反馈。
- **Phase 3 — AI 与打磨**：远程怪找射界、提示表现、密度玩测微调。

> Phase 1 完成后地图已不空旷；Phase 2 才让掩体「能躲箭」。两阶段独立可验收。
