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
| 流沙扩张（反风筝） | **2026-06-14 新增**：每次潜地时在 boss 身侧（Chebyshev ≤1）翻起 **2** 个**动态**沙坑（带 `remaining`，存续 **5** 回合后自动消失），逐步把场地变雷区、压缩风筝走廊 | `SANDWORM_DYNAMIC_PIT_PER_BURROW` / `SANDWORM_DYNAMIC_PIT_DURATION` / `sandwormBurrow()` |
| 静态沙坑 | 开房时刷 **5** 个永久沙坑（2026-06-14 由 4 → 5，无 `remaining`，不消失） | `CHAPTER2_SAND_PIT_COUNT` |
| 踩入沙坑惩罚 | 移动 AP **+2**（2026-06-14 由 +1 → +2；静态/动态沙坑共用；重度迟滞而非完全锁移动，与冰霜区分） | `CHAPTER2_SAND_PIT_MOVE_PENALTY` |
| 其余回合 | 普通近战攻击（`monsterAttack`） | — |

行为节奏：潜地（免疫一回合、身侧翻起流沙）→ 冒出贴脸双倍重击 → 恢复普通近战 → ... 循环。「冒出双倍」是爆发，「流沙扩张」是常驻压迫——两者互补：玩家无法在潜地期间输出，且场地随战斗逐渐被流沙压缩，难以维持「打一下退一格」的精确风筝。

### 沙坑地形（第 2 章 Boss 房）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 沙坑数量 | **4** 个，进入 Boss 房（第 10 层）时生成 | `CHAPTER2_SAND_PIT_COUNT` |
| 踩入效果 | 移动 AP 消耗 **+1**（emit `SAND_PIT_STEPPED`） | `CHAPTER2_SAND_PIT_MOVE_PENALTY` |
| Boss 冒出选址 | 优先选距玩家最近的空闲沙坑冒出；沙坑均被占用时回退到玩家相邻空格 | — |

设计意图：沙坑既是地形减速手段，也为 Boss 冒出提供更具威胁感的"伏击点"。

## 四、第 3 章 Boss：冰霜巨人（FrostGiant.ts，第 15 层）

> **2026-06-14 机制重做（反风筝）**：原「冰冻回合 AP 上限 -4」（`playerFreezeRounds`/`FREEZE_APPLIED`）**整套删除**，改为「冰冻回合铺冰面 + 踩冰滑行」——把「改数值」变成「改战场」。AP-4 只让玩家少走、不阻止「走 1 + 打」，仍可被无伤风筝；冰面滑行让玩家丢失「精确后撤 1 格」的走位控制，真正打断风筝。

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 冰面生成间隔 | 每 **4** 个怪物回合的近战命中后触发（复用原冰冻间隔常量） | `FROST_GIANT_FREEZE_INTERVAL` |
| 冰面范围 | 以**玩家当前格**为中心、曼哈顿距离 ≤ **1**（「+」字 5 格，跳过障碍/怪物格） | `FROST_GIANT_ICE_RADIUS` |
| 冰面存续 | **2** 回合后融化（`remaining` 倒计时，由 `ExpeditionState.endTurn` 统一移除） | `FROST_GIANT_ICE_DURATION` |
| 踩冰滑行 | 玩家**站在**冰面上移动时，沿方向**连续滑行**到「第一个非冰可走格」；撞墙/石块/冰墙/怪物则停在障碍前。整段滑行只收 1 次移动 AP，沿途揭雾，确定性无 RNG。从非冰格踏上冰面只算普通一步（下回合站冰上才滑） | `MovementSystem.applyMove()` / `ICE_TILE` 实体 |
| 其余回合 | 普通近战攻击（`monsterAttack`） | — |

行为节奏：每 4 回合一次「普攻 + 以玩家为中心铺冰」。冰面对称铺开 → 玩家任意方向后撤都会**过冲到冰面边缘**，丢掉风筝赖以生存的精确间距；巨人本身不滑、稳步推进，趁玩家失控期落拳。落点（边缘）可预测，便于巨人逼近。冰面不造成伤害，纯改变移动。

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
| 熔岩潮汐焰格数/次 | **6**（2026-06-14 由 3 → 6，加大二阶段安全区压缩） | `CHAPTER4_LAVA_TIDE_TILE_COUNT` |

行为节奏：每次近战攻击都附带灼烧 DOT，且可无限叠加——若玩家不能快速击杀或脱离接触，灼烧伤害会持续累积，是持久战压力的来源。

### 熔岩潮汐阶段（HP ≤ 50%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 阶段触发阈值 | Boss HP/maxHp ≤ **50%**，进入后不可逆 | `CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO` |
| 首次刷潮汐 | 进入 phase2 当回合立即刷出一批熔岩格（emit `LAVA_TIDE_SPAWNED`） | — |
| 刷新间隔 | 此后每 **3** 个 Boss 回合再刷一批 | `CHAPTER4_LAVA_TIDE_INTERVAL` |
| 每批数量 | **6** 格（2026-06-14 由 3 → 6） | `CHAPTER4_LAVA_TIDE_TILE_COUNT` |
| 持续回合 | 每格存在 **2** 回合后自动消失 | `CHAPTER4_LAVA_TIDE_DURATION` |
| 踩入伤害 | 玩家踩入熔岩格 **-5 HP**（回合结束结算，emit `LAVA_TILE_DAMAGED`） | `CHAPTER4_LAVA_TILE_DAMAGE` |

设计意图：Boss 进入残血阶段后地形随机覆盖熔岩，叠加灼烧 DOT，构成"残血更危险"的最终冲刺压力。

## 六、第 5 章 Boss：命运守卫（FateGuardian.ts，第 25 层）

> **2026-06-14 机制重做（反风筝）**：原「玩家 HP≤50% 时守卫 40% 概率闪避」（`fateGuardianEvade` + `CombatSystem.playerAttack` 内联闪避）**整套删除**——随机闪避是最劝退的机制（玩家感受是「我怎么打不中」而非「我该怎么破解」），且对纯风筝玩家从不生效（玩家从不挨打，倍率/闪避都触发不了）。改为「命运预言」：把**博概率**换成**博走位**。

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 高血量惩罚阈值 | 玩家 HP > **50%** maxHp 时，守卫伤害 **×2**（**保留**） | `FATE_GUARDIAN_HP_THRESHOLD` |
| 命运预言间隔 | 每 **3** 个怪物回合标记一次 | `FATE_PROPHECY_INTERVAL` |
| 预言机制 | **标记回合**：记录玩家**当前格**为中心（emit `PROPHECY_MARKED`，本回合标记、玩家看得到）；**下个** Boss 回合该 **3×3** 区域爆炸（emit `PROPHECY_RESOLVED`，无论命中均 emit 供渲染），玩家若仍在区域内受 `round(boss.attack × 1.0)` 伤害。「先结算、后标记」保证总提前 1 个怪物回合预警 | `FATE_PROPHECY_RADIUS` / `FATE_PROPHECY_DAMAGE_MULT` / `fateProphecyStep()` |

设计意图：双向博弈——
- 高血量时被 Boss 双倍压制，惩罚"轻敌堆血莽撞输出"。
- 命运预言逼玩家走位：站桩苟血风筝者必吃 3×3 爆炸，堵住"苟着风筝磨血"的逃课打法。
- 莽脸吃双倍、苟风筝吃预言，双向都堵，且都是**玩法博弈**（进退/走位）而非数值/概率博弈。

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
| 沙虫女王 | 2 | 周期性免疫 + 突袭双倍 + 流沙扩张（反风筝） | 是（静态/动态沙坑） | 否 |
| 冰霜巨人 | 3 | 冰面滑行地形（反风筝，2026-06-14 由 AP 削减重做） | 是（冰面 + 冰墙） | 否 |
| 熔岩领主 | 4 | 持续 DOT 叠加 + 残血地形（熔岩潮汐） | 是（熔岩格） | 否 |
| 命运守卫 | 5 | 高血双倍 + 命运预言（反风筝，2026-06-14 由随机闪避重做）+ 残血召唤镜像 | 是（预言 AOE） | 是（命运镜像） |

> **2026-06-14 反风筝重做小结**：第 2/3/5 章 Boss 此前是「改良版纯近战」（沙虫除潜地外、冰霜的 AP-4、命运的倍率/闪避），其「改良部分」恰恰能被「打一下退一格」的无伤风筝绕过失效。本次为三者各加一套**不依赖赢得走位博弈**的压迫手段（流沙地形 / 冰面滑行 / 预言 AOE），让玩家「换打法」而非「被系统禁止风筝」。第 1 章哥布林（已抗住）、第 4 章熔岩（DOT+潮汐已抗住）维持现状（熔岩仅焰格 3→6）。详见 `specs/260614-boss-anti-kite/design.md`。
