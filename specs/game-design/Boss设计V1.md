# Boss 设计 V1

> 来源：拆分自 `specs/balance-reference.md` §11 + `assets/scripts/pve/core/bosses/*.ts`。
> 实现文件：`assets/scripts/pve/core/bosses/{GoblinChief,SandwormQueen,FrostGiant,LavaLord,FateGuardian}.ts`。
> 状态：5 章 Boss 机制均已实现；第 1 章哥布林酋长机制最完整（含地形/增援），2-5 章 Boss 为单一专属机制 + 普通近战。

## 一、设计原则

每章 Boss 在「普通近战攻击」（`monsterAttack`）基础上叠加 **1 个该章专属机制**，机制强度随章节倍率（`bossChapterScaling`）放大：

| 章节 | Boss 倍率 |
|------|------|
| 1 | ×1.5 |
| 2 | ×2.2 |
| 3 | ×3.0 |
| 4 | ×3.8 |
| 5 | ×4.5 |

Boss 基础数值（章节倍率前）：HP 300 / 攻击 30（×10基准，原30/3）/ 攻击范围 1 / 感知半径 99（全图感知）。

## 二、第 1 章 Boss：哥布林酋长（GoblinChief.ts，第 5 层）

机制最完整，包含地形、AOE、增援三套系统，迫使玩家从"放风筝"转为正面接近。

| 数值 | 当前值 | 变量 |
|------|--------|------|
| HP | `Math.round(300×1.5)=450`（与其他 Boss 相同，按 `bossChapterScaling` 计算，不再绕过；×10基准，原45） | `MONSTER_BASE.BOSS.hp × bossChapterScaling(1)` |
| 攻击 | `Math.round(30×1.5)=45`（×10基准，原5） | `MONSTER_BASE.BOSS.attack × bossChapterScaling(1)` |
| 攻击范围（普通攻击） | **2**（单目标，曼哈顿距离；2026-06-10 由 3 下调为 2） | `GOBLIN_CHIEF_RANGE` |
| 狂暴阈值 | HP ≤ **200**（×10基准，原20） 时进入：攻击 +10（×10基准，原+1）、移动 +1 | `GOBLIN_CHIEF_ENRAGE_HP` |

### 蓄力重击（同心圆 AOE）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发间隔 | 每 **3** 个怪物回合（2026-06-11 由 2 → 3，降低触发频率） | `HEAVY_STRIKE_INTERVAL` |
| 内圈半径 | 曼哈顿距离 **≤2** | `HEAVY_STRIKE_INNER_RANGE` |
| 外圈半径 | 曼哈顿距离 **3-4** | `HEAVY_STRIKE_RANGE=4` |
| 内圈伤害倍率 | **×1.5** 基础攻击 → round(45×1.5)=**68**（无护甲、非狂暴；2026-06-13 由 ×2 下调为 ×1.5，伤害取整 `Math.round`） | `HEAVY_STRIKE_MULTIPLIER` |
| 外圈伤害倍率 | **×1.5** 基础攻击 → round(45×1.5)=**68**（无护甲、非狂暴；2026-06-13 由 ×2 下调为 ×1.5，与内圈倍率相同） | `HEAVY_STRIKE_OUTER_MULTIPLIER` |
| 余波效果 | 被命中后移动 AP+1，持续 **2** 回合 | `HEAVY_AOE_SLOW_ROUNDS`（PveConstants） |
| 命中标识（橙圈） | **2026-06-11 取消"重击前一回合"独立预警**（原 `HEAVY_STRIKE_WARNING`/红圈已移除）；改为：重击回合内玩家先行动，随后 boss 移动结算并 emit `HEAVY_STRIKE_RESOLVED{center}`（命中/未命中/被石块吸收均会emit）；地图上以**结算时刻**的 boss 位置为中心，绘制半径 = `HEAVY_STRIKE_RANGE`(4) 的橙色范围，标识本次重击真正打到哪里。玩家在该回合后即可看到橙圈并据此规划之后 2 个安全回合的走位 | `goblinChiefAttack()` / `FogMapView.showAoeHit()` |
| 高亮清除时机 | 橙圈在 `ExpeditionController._onEndTurn()`（进入下一怪物回合前）统一清除，随后按当前回合事件重新绘制 | `ExpeditionController._onEndTurn()` |

### 地形与增援

| 数值 | 当前值 | 变量 |
|------|--------|------|
| Boss 房石块数量 | **2** 块（第一章 Boss 层随机生成） | `CHAPTER1_BOSS_ROCK_COUNT` |
| 石块遮挡 | 石块（`ROCK` 实体）会阻挡玩家移动，且在 boss→player 路径上时吸收一次 AOE 伤害后消失 | `findBlockingRock()` / `MovementSystem.isBlockedByRock()` |
| 石块显示 | 地图格子用「石」字标识（此前 UI 缺失该图标，玩家会看到"无法移动"但格子是空的；已修复） | `FogMapView.GLYPH.ENTITY_ROCK` |
| 命中范围中的安全格 | 橙圈命中范围内，被石块遮挡（boss→该格连线上有未消耗石块）的格子视为「安全」，用绿色区分标识，不会受到本次 AOE 伤害 | `isCellShadowedByRock()` / `FogMapView.showAoeHit(danger, safe)` |
| 增援号角 | 召唤哥布林战士×1；狂暴后改为召唤×2（2026-06-13 由"弓箭手×2/狂暴额外战士×2"调整为纯战士，降低对玩家 AP 的分割压力） | `HORN_WARRIOR_COUNT` / `HORN_WARRIOR_ENRAGE_COUNT` |
| 增援间隔 | 非狂暴每 **3** 个怪物回合一次；进入狂暴（HP≤`GOBLIN_CHIEF_ENRAGE_HP`）后改为每 **2** 个怪物回合一次（2026-06-10 由"与蓄力重击同步的 2 回合"调整而来）。蓄力重击固定每 **3** 回合一次（`HEAVY_STRIKE_INTERVAL`，2026-06-11 由 2 调整），故非狂暴时两者周期相同（均为 3）；狂暴后增援变为 2 回合一次而蓄力重击仍为 3 回合一次，周期错开。两者同一怪物回合内同时触发时，**先结算 AOE 重击、再召唤增援** | `HORN_INTERVAL_NORMAL` / `HORN_INTERVAL_ENRAGED` / `isHornTurn()` / `stepGoblinChief()` |

### 掉落

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 专属武器掉落 | **50%** 概率掉落「哥布林酋长战斧」（RARE WEAPON +30，×10基准，原+3） | `applyGoblinChiefDrop()`（LootSystem.ts） |

### 设计意图

- 攻击范围 2（2026-06-10 由 3 下调）：射手最大射程为 1+2(职业)+1(词条)=4，比 Boss 多 2 格安全距离，放风筝空间更充裕；本次下调是哥布林酋长整体强度削弱的一部分（另见 HP 改为按 `bossChapterScaling` 计算、增援号角间隔拉长至非狂暴 3 回合）。
- 蓄力重击范围达 6（内圈2+外圈4 跨度），基本覆盖 10×10 Boss 房的大部分区域，迫使玩家主动贴近后撤离。
- HP≤200（×10基准，原20） 进入狂暴后每回合多走一步（`MonsterAI.stepBoss` 处理）+ 攻击提升，追击能力显著增强，是战斗后期的"收尾"压力点。

## 三、第 2 章 Boss：沙虫女王（SandwormQueen.ts，第 10 层）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 潜地间隔 | 每 **4** 个怪物回合 | `SANDWORM_BURROW_INTERVAL` |
| 潜地状态 | 免疫玩家攻击（`isBurrowed=true`） | `PveTypes.ts` |
| 冒出表现 | 下一回合在玩家曼哈顿距离 ≤1 的随机空格冒出，立即发动 **×2** 倍伤害普攻 | — |
| 其余回合 | 普通近战攻击（`monsterAttack`） | — |

行为节奏：潜地（免疫一回合）→ 冒出贴脸双倍重击 → 恢复普通近战 → ... 循环。玩家无法在 Boss 潜地期间输出，需预判冒出位置应对突袭。

### 沙坑地形（第 2 章 Boss 房）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 沙坑数量 | **4** 个，进入 Boss 房（第 10 层）时生成 | `CHAPTER2_SAND_PIT_COUNT` |
| 踩入效果 | 移动 AP 消耗 **+1**（emit `SAND_PIT_STEPPED`） | `CHAPTER2_SAND_PIT_MOVE_PENALTY` |
| Boss 冒出选址 | 优先选距玩家最近的空闲沙坑冒出；沙坑均被占用时回退到玩家相邻空格 | — |

设计意图：沙坑既是地形减速手段，也为 Boss 冒出提供更具威胁感的"伏击点"。

## 四、第 3 章 Boss：冰霜巨人（FrostGiant.ts，第 15 层）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 冰冻间隔 | 每 **4** 个怪物回合 | `FROST_GIANT_FREEZE_INTERVAL` |
| 冰冻持续 | **1** 回合 | `FROST_GIANT_FREEZE_ROUNDS` |
| 冰冻 AP 惩罚 | 玩家 AP 上限 **-4**（最低保留 1） | `FROST_GIANT_AP_PENALTY` |
| 其余回合 | 普通攻击 + 施加冰冻 / 普通近战攻击 | — |

行为节奏：每 4 回合一次"普通攻击 + 冰冻"组合技，大幅压缩玩家下一回合的行动空间（AP 上限-4），其余回合为普通近战。

### 冰墙地形（第 3 章 Boss 房）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 冰墙数量 | **3** 个，进入 Boss 房（第 15 层）时生成 | `CHAPTER3_ICE_WALL_COUNT` |
| 冰墙 HP | **10** | `CHAPTER3_ICE_WALL_HP` |
| 移动到冰墙格 | no-op（位置不变，AP 不扣） | — |
| 攻击冰墙 | 扣减 HP，不掉灵气、不消耗 RNG；HP=0 时 `consumed=true`，emit `ICE_WALL_BROKEN`，玩家获得灵气 **+1** | `CHAPTER3_ICE_WALL_DROP_ANIMA` |

设计意图：冰墙阻挡走位、迫使玩家分配 AP 清障，击碎后的灵气奖励补偿清障开销。

## 五、第 4 章 Boss：熔岩领主（LavaLord.ts，第 20 层）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 灼烧 tick 数/次攻击 | **3** tick（每 tick = 10 HP/回合，×10基准，原1HP） | `LAVA_LORD_BURN_TICKS` |
| 叠加方式 | 每次攻击命中后 `playerBurnRemaining += LAVA_LORD_BURN_TICKS`（可叠加） | — |
| 结算时机 | 灼烧在回合开始时逐点消耗（`ExpeditionState.endTurn` 处理） | — |

行为节奏：每次近战攻击都附带灼烧 DOT，且可无限叠加——若玩家不能快速击杀或脱离接触，灼烧伤害会持续累积，是持久战压力的来源。

### 熔岩潮汐阶段（HP ≤ 50%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 阶段触发阈值 | Boss HP/maxHp ≤ **50%**，进入后不可逆 | `CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO` |
| 首次刷潮汐 | 进入 phase2 当回合立即刷出一批熔岩格（emit `LAVA_TIDE_SPAWNED`） | — |
| 刷新间隔 | 此后每 **3** 个 Boss 回合再刷一批 | `CHAPTER4_LAVA_TIDE_INTERVAL` |
| 每批数量 | **3** 格 | `CHAPTER4_LAVA_TIDE_TILE_COUNT` |
| 持续回合 | 每格存在 **2** 回合后自动消失 | `CHAPTER4_LAVA_TIDE_DURATION` |
| 踩入伤害 | 玩家踩入熔岩格 **-5 HP**（回合结束结算，emit `LAVA_TILE_DAMAGED`） | `CHAPTER4_LAVA_TILE_DAMAGE` |

设计意图：Boss 进入残血阶段后地形随机覆盖熔岩，叠加灼烧 DOT，构成"残血更危险"的最终冲刺压力。

## 六、第 5 章 Boss：命运守卫（FateGuardian.ts，第 25 层）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 高血量惩罚阈值 | 玩家 HP > **50%** maxHp 时，守卫伤害 **×2** | `FATE_GUARDIAN_HP_THRESHOLD` |
| 低血量闪避 | 玩家 HP ≤ 50% maxHp 时，守卫 **40%** 概率完全闪避玩家攻击（已接入 `CombatSystem.playerAttack`） | `FATE_GUARDIAN_DODGE_CHANCE` |

设计意图：双向博弈——
- 高血量时被 Boss 双倍压制，惩罚"轻敌堆血莽撞输出"。
- 低血量时 Boss 获得闪避，保护其在玩家残血时不被秒杀，避免"苟血量然后越级击杀"的策略一边倒。

### 镜像分身（HP ≤ 33%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 生成阈值 | Boss HP/maxHp ≤ **33%**，下一回合在 Boss 相邻空格生成镜像（emit `MIRROR_SPAWNED`） | `CHAPTER5_MIRROR_SPAWN_HP_RATIO` |
| 镜像 HP | **20** | `CHAPTER5_MIRROR_HP` |
| 镜像攻击力 | Boss 攻击 **× 0.5** | `CHAPTER5_MIRROR_ATTACK_MULT` |
| 镜像 AI | 普通近战 AI（不复用 Boss 专属机制） | `bossId='FATE_MIRROR'` |
| 镜像被击杀 | emit `MIRROR_KILLED`，不掉落、不触发传送门生成（`spawnPortal` 只看真 Boss） | — |
| 重复生成 | 场上已有存活镜像时不再生成 | — |

设计意图：残血阶段额外引入一个输出体，迫使玩家分散注意力或优先清理镜像，避免最终 Boss 战节奏过于单一。

## 七、跨 Boss 共性与差异总结

| Boss | 章节 | 核心机制类型 | 是否影响地形 | 是否召唤增援 |
|------|------|--------------|--------------|--------------|
| 哥布林酋长 | 1 | AOE 范围伤害 + 减速 | 是（石块） | 是（哥布林战士） |
| 沙虫女王 | 2 | 周期性免疫 + 突袭双倍 | 是（沙坑） | 否 |
| 冰霜巨人 | 3 | 周期性 AP 削减 | 是（冰墙） | 否 |
| 熔岩领主 | 4 | 持续 DOT 叠加 + 残血地形（熔岩潮汐） | 是（熔岩格） | 否 |
| 命运守卫 | 5 | 血量阈值双向博弈（伤害倍率/闪避）+ 残血召唤镜像 | 否 | 是（命运镜像） |

**待规划**：第 2-5 章 Boss 当前机制复杂度明显低于第 1 章（无地形、无增援），是否需要补充类似的环境互动元素以保持难度曲线一致性，未在本设计范围内确认。
