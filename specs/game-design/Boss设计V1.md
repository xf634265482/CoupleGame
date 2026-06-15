# Boss 设计 V1

> 来源：拆分自 `specs/balance-reference.md` §11 + `assets/scripts/pve/core/bosses/*.ts`。
> 实现文件：`assets/scripts/pve/core/bosses/{GoblinChief,QuicksandScorpion,FrostGiant,LavaLord,FateGuardian}.ts`。
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

### 视觉体型与判定规则（2026-06-15 新增）

> **判定看脚，不看身体**：Boss 视觉图标放大，但判定位置始终是其逻辑坐标所在的那一格。

| 数值 | 当前值 | 变量 |
|------|--------|------|
| Boss 图标视觉缩放 | **×1.6**，渲染在独立 overlay 层（高于格子与 AOE 高亮层），以 Boss 所在格为中心居中放大显示，溢出到相邻格 | `BOSS_ICON_SCALE` / `FogMapView._bossIconOverlay` |
| 脚下判定标记 | Boss 所在格不再绘制小号"王"字，改绘制红色圆环描边，标识真实判定位置 | `BOSS_FOOT_RING_STROKE` / `FogMapView._paintCell()` |
| 判定基准 | 普攻范围、AOE 中心/半径（蓄力重击红橙圈、命运预言 3×3 等）、移动碰撞、地形生成等**全部以该格逻辑坐标为基准**，不因视觉放大而改变 | — |

设计意图：让 Boss 在不重构网格系统（多格 footprint）的前提下获得接近 2×2 体型的视觉压迫感；放大图标可能视觉遮挡相邻格内容（石块/沙坑等），但因脚下圆环 = 判定基准，玩家很快能学会"看圆环不看身体"，不影响走位博弈的精确性。

## 二、第 1 章 Boss：哥布林酋长（GoblinChief.ts，第 5 层）

机制最完整，包含地形、AOE、增援三套系统，迫使玩家从"放风筝"转为正面接近。

| 数值 | 当前值 | 变量 |
|------|--------|------|
| HP | `Math.round(300×1.5)=450`（与其他 Boss 相同，按 `bossChapterScaling` 计算，不再绕过；×10基准，原45） | `MONSTER_BASE.BOSS.hp × bossChapterScaling(1)` |
| 攻击 | `Math.round(30×1.5)=45`（×10基准，原5） | `MONSTER_BASE.BOSS.attack × bossChapterScaling(1)` |
| 攻击范围（普通攻击） | **1**（单目标，曼哈顿距离，纯近战；2026-06-10 由 3 下调为 2，2026-06-15 进一步下调为 1） | `GOBLIN_CHIEF_RANGE` |
| 狂暴阈值 | HP ≤ **170**（×10基准；2026-06-15 由 200 下调为 170） 时进入：攻击 +10（×10基准，原+1）、移动 +1。**2026-06-15**：玩家攻击使 HP 首次跨过该阈值（且未致死）时 emit `BOSS_ENRAGED`，在战报中提示"进入狂暴"（HP 跨越天然只触发一次） | `GOBLIN_CHIEF_ENRAGE_HP` / `CombatSystem.resolveHit()` |

### 蓄力重击（同心圆 AOE）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发间隔 | 每 **3** 个怪物回合（2026-06-11 由 2 → 3，降低触发频率） | `HEAVY_STRIKE_INTERVAL` |
| 内圈半径 | 曼哈顿距离 **≤2** | `HEAVY_STRIKE_INNER_RANGE` |
| 外圈半径 | 曼哈顿距离 **3-4**（整体 AOE 半径=4；2026-06-15 曾短暂下调为 3，同日改「站桩」方案后改回 4） | `HEAVY_STRIKE_RANGE=4` |
| 内圈伤害倍率 | **×1.5** 基础攻击 → round(45×1.5)=**68**（无护甲、非狂暴；2026-06-13 由 ×2 下调为 ×1.5，伤害取整 `Math.round`） | `HEAVY_STRIKE_MULTIPLIER` |
| 外圈伤害倍率 | **×1.5** 基础攻击 → round(45×1.5)=**68**（无护甲、非狂暴；2026-06-13 由 ×2 下调为 ×1.5，与内圈倍率相同） | `HEAVY_STRIKE_OUTER_MULTIPLIER` |
| 余波效果 | **2026-06-15 移除**：命中后不再附带「移动AP+1」减速（原 `HEAVY_AOE_SLOW_ROUNDS`，常量已删除） | — |
| **回合行动模型**（2026-06-15 最终方案「先释放后追击」） | boss 一回合内「技能/攻击二选一 + 移动追击」。**重击回合**：先在【原地】释放半径 `HEAVY_STRIKE_RANGE`(4) 的 AOE（范围攻击无需贴身），**释放后再追击逼近玩家**（boss 不呆站）。**普通回合**：近战普攻需贴身，故「先移动到攻击范围内、再普攻」。释放发生在移动之前，是「红圈预警精确」的前提：重击释放中心 = 重击回合起手位置 = 上一回合红圈中心。曾历经「站桩」（boss 完全不动、观感呆）方案后改为此 | `stepGoblinChief()`（`heavy` 分支先 `goblinChiefAttack` 后 `chasePlayer(moveSteps, -1)`） |
| 命中预警（红圈） | **2026-06-15 恢复 → 最终「先释放后追击+精确预警」**：重击回合的前一个怪物回合，boss 完成本回合（普通）移动后，emit `HEAVY_STRIKE_WARNING{center, radius}`，其中 `center` = boss **当前实际位置**，`radius` = `HEAVY_STRIKE_RANGE`(4)；地图上以此画红圈（全部标红，与橙圈一致），并在战报中给出文字提示。因重击回合 boss 先在起手位置原地释放、且 boss 在玩家回合内不动，红圈与下回合实际命中橙圈**完全同心同半径**，预警 100% 精确：玩家只要把自己移出红圈（距 boss 当前位置 > `HEAVY_STRIKE_RANGE`）即绝对安全，且不会因红圈虚大而多走位浪费 AP。（中途曾尝试「威胁区」方案：半径 = 重击半径+移动步数，因 boss 追击导致红圈恒大于橙圈、误导玩家多移动） | `stepGoblinChief()` / `FogMapView.showAoeWarning()` |
| 命中标识（橙圈） | 重击回合内玩家先行动，随后 boss 在起手位置原地结算并 emit `HEAVY_STRIKE_RESOLVED{center}`（`center` = boss 起手位置；命中/未命中/被石块吸收均会emit），**之后** boss 才追击移动；地图上以该中心绘制半径 = `HEAVY_STRIKE_RANGE`(4) 的橙色范围，与上一回合红圈完全重合。**2026-06-15**：橙圈不再延续到玩家下一回合，改为本回合事件回放结束后展示 **1 秒**再清除（`delay(1000)`，不阻塞 `_busy`），避免一闪而过看不清，又不会被误读为"还会再炸一次"的预警 | `goblinChiefAttack()` / `FogMapView.showAoeHit()` |
| 高亮清除时机 | 红圈：在 `ExpeditionController._onEndTurn()`（进入下一怪物回合前）统一清除，随后按当前回合事件重新绘制（重击回合时红圈被橙圈取代）。橙圈：本回合事件回放结束后延迟 1 秒清除（2026-06-15 由"回放结束立即清除"调整为"延迟 1 秒清除"；若 1 秒内已进入下一怪物回合，`_onEndTurn` 的 `clearAoeHit` 会先清掉，延迟清除即为空操作） | `ExpeditionController._onEndTurn()` / `ExpeditionController._playEvents()` |

### 地形与增援

| 数值 | 当前值 | 变量 |
|------|--------|------|
| Boss 房石块数量 | **2** 块（第一章 Boss 层随机生成） | `CHAPTER1_BOSS_ROCK_COUNT` |
| 石块遮挡 | 石块（`ROCK` 实体）会阻挡玩家移动，且在 boss→player 路径上时吸收一次 AOE 伤害后消失 | `findBlockingRock()` / `MovementSystem.isBlockedByRock()` |
| 石块显示 | 地图格子用「石」字标识（此前 UI 缺失该图标，玩家会看到"无法移动"但格子是空的；已修复） | `FogMapView.GLYPH.ENTITY_ROCK` |
| 命中范围中的安全格 | 橙圈命中范围内，被石块遮挡（boss→该格连线上有未消耗石块）的格子视为「安全」，用绿色区分标识，不会受到本次 AOE 伤害 | `isCellShadowedByRock()` / `FogMapView.showAoeHit(danger, safe)` |
| 增援号角 | 召唤哥布林战士×1；狂暴后改为召唤×2（2026-06-13 由"弓箭手×2/狂暴额外战士×2"调整为纯战士，降低对玩家 AP 的分割压力）。**2026-06-15**：召唤出的战士带 `summoned` 标记，击杀后**不产生任何掉落**（金币/灵气/装备），避免玩家靠刷增援白嫖收益 | `HORN_WARRIOR_COUNT` / `HORN_WARRIOR_ENRAGE_COUNT` / `Monster.summoned` / `applyMonsterKillDrop()` |
| 增援间隔 | 非狂暴每 **3** 个怪物回合一次；进入狂暴（HP≤`GOBLIN_CHIEF_ENRAGE_HP`）后改为每 **2** 个怪物回合一次（2026-06-10 由"与蓄力重击同步的 2 回合"调整而来）。蓄力重击固定每 **3** 回合一次（`HEAVY_STRIKE_INTERVAL`，2026-06-11 由 2 调整），故非狂暴时两者周期相同（均为 3）；狂暴后增援变为 2 回合一次而蓄力重击仍为 3 回合一次，周期错开。两者同一怪物回合内同时触发时，**先结算 AOE 重击、再召唤增援** | `HORN_INTERVAL_NORMAL` / `HORN_INTERVAL_ENRAGED` / `isHornTurn()` / `stepGoblinChief()` |

### 掉落

> 2026-06-15 重做为统一三层结构（详见 §八「Boss 掉落统一结构」）。第 1 章 GOBLIN_CHIEF 沿用该结构，专属池为 3 件 RARE 装备。

### 设计意图

- 攻击范围 1（2026-06-10 由 3→2，2026-06-15 由 2→1）：改为纯近战后，普通攻击不再具备"隔格输出"能力，玩家可通过保持 2 格以上距离完全规避普通攻击，仅蓄力重击的大范围 AOE 仍会追到风筝位。
- 蓄力重击整体 AOE 半径 **4**（内圈≤2 重伤 + 外圈 3-4 圈），覆盖 10×10 Boss 房较大范围，迫使玩家主动贴近后撤离。2026-06-15 改为「先释放后追击」：重击回合 boss 先在起手位置原地释放（红圈=橙圈完全重合，玩家跑出半径 4 即绝对安全、不浪费 AP），释放后再追击逼近——既保证预警精确，又让 boss 持续施压、不呆站；同日移除命中后的移动AP+1减速余波，避免"被AOE命中+减速"双重惩罚叠加过猛。
- HP≤170（×10基准；2026-06-15 由 200 下调）进入狂暴后每回合多走一步（`MonsterAI.stepBoss` 处理）+ 攻击提升，追击能力显著增强，是战斗后期的"收尾"压力点；阈值下调让狂暴在玩家血线更紧张前提前到来。
- 2026-06-15：橙圈（实际命中）此前会延续到玩家下一回合，容易被误读为"还会再炸一次"的预警；改为本回合事件回放结束即清除。同时恢复红圈预警（提前一回合预测下回合落点），让"预警→命中"两阶段各司其职，并在战报中分别给出文字提示，避免玩家误判。

## 三、第 2 章 Boss：流沙巨蝎（QuicksandScorpion.ts，第 10 层）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 潜地间隔 | 每 **4** 个怪物回合（狂暴后缩短为 **3**，见下「狂暴状态」） | `QUICKSAND_SCORPION_BURROW_INTERVAL` / `QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED` |
| 潜地状态 | 免疫玩家攻击（`isBurrowed=true`） | `PveTypes.ts` |
| 冒出表现 | 下一回合在玩家曼哈顿距离 ≤1 的随机空格（优先空闲沙坑）冒出，立即发动 **×2** 倍伤害普攻 | — |
| 冒出落点留痕 | **2026-06-15 新增**：冒出落点会留下/转化为一个**永久**沙坑（已是动态坑则去掉 `remaining` 变永久；无坑则新建），战场逐回合永久变难 | `quicksandScorpionAttack()` |
| 流沙扩张（反风筝） | **2026-06-14 新增**：每次潜地时在 boss 身侧（Chebyshev ≤1）翻起 **2** 个**动态**沙坑（带 `remaining`，存续 **8** 回合后自动消失，2026-06-15 由 5→8）。存续 > 潜地间隔(4/3)，多波沙坑会叠加共存而非维持恒定数量，逐步把场地变雷区、营造「越来越走不了」的压迫感 | `QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW` / `QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION` / `quicksandScorpionBurrow()` |
| 沙暴（反风筝） | **2026-06-15 新增**：每次潜地时额外随机覆盖 **2** 格（狂暴后 **4** 格）形成沙暴（emit `SANDSTORM_SPAWNED`），命中玩家所在格造成 **1** 点**真实伤害**（无视护甲，emit `SANDSTORM_HIT`）；与流沙扩张同时结算，逼迫玩家在潜地回合也不能"安全站桩" | `QUICKSAND_SCORPION_SANDSTORM_CELLS` / `QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED` / `QUICKSAND_SCORPION_SANDSTORM_DAMAGE` |
| 静态沙坑 | 开房时刷 **5** 个永久沙坑（2026-06-14 由 4 → 5，无 `remaining`，不消失） | `CHAPTER2_SAND_PIT_COUNT` |
| 踩入沙坑惩罚 | 移动 AP **+2**（2026-06-14 由 +1 → +2；静态/动态沙坑共用；重度迟滞而非完全锁移动，与冰霜区分） | `CHAPTER2_SAND_PIT_MOVE_PENALTY` |
| 其余回合 | 普通近战攻击（`monsterAttack`） | — |

行为节奏：潜地（免疫一回合、身侧翻起流沙 + 随机沙暴）→ 冒出贴脸双倍重击（落点留下永久沙坑）→ 恢复普通近战 → ... 循环。「冒出双倍」是爆发，「流沙扩张 + 沙暴」是常驻压迫——三者互补：玩家无法在潜地期间输出，潜地回合也会被沙暴间接打到，且场地随战斗逐渐被永久/动态沙坑压缩，难以维持「打一下退一格」的精确风筝。

### 狂暴状态（HP 占比 ≤ 30%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发阈值 | Boss HP/maxHp ≤ **30%**，首次跨过时 emit `BOSS_ENRAGED{bossId: 'QUICKSAND_SCORPION'}` | `QUICKSAND_SCORPION_ENRAGE_HP_RATIO` |
| 潜地间隔 | 由 **4** 回合缩短为 **3** 回合 | `QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED` |
| 沙暴范围 | 由 **2** 格扩大为 **4** 格（伤害仍为 1 点真实伤害/格） | `QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED` |

设计意图：残血阶段潜地更频繁、沙暴覆盖更广，避免"残血龟缩风筝"成为最优解，呼应"残血更危险"的 Boss 节奏惯例（同熔岩领主二阶段）。

### 沙坑地形（第 2 章 Boss 房）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 沙坑数量 | **4** 个，进入 Boss 房（第 10 层）时生成 | `CHAPTER2_SAND_PIT_COUNT` |
| 踩入效果 | AP **-2**（emit `SAND_PIT_STEPPED`，战报「🏜️ 陷入流沙！AP -2」） | `CHAPTER2_SAND_PIT_MOVE_PENALTY` |
| Boss 冒出选址 | 优先选距玩家最近的空闲沙坑冒出；沙坑均被占用时回退到玩家相邻空格 | — |

设计意图：沙坑既是地形减速手段，也为 Boss 冒出提供更具威胁感的"伏击点"。

## 四、第 3 章 Boss：冰霜巨人（FrostGiant.ts，第 15 层）

> **2026-06-14 机制重做（反风筝 v1）**：原「冰冻回合 AP 上限 -4」（`playerFreezeRounds`/`FREEZE_APPLIED`）**整套删除**，改为「冰冻回合铺冰面 + 踩冰滑行」——把「改数值」变成「改战场」。AP-4 只让玩家少走、不阻止「走 1 + 打」，仍可被无伤风筝；冰面滑行让玩家丢失「精确后撤 1 格」的走位控制，真正打断风筝。
>
> **2026-06-15 机制重做（反风筝 v2，叠加于 v1 之上）**：v1 的冰面滑行仍保留，但「贴脸打一下、退一步」式风筝在冰面机制之外仍可行。新增三套机制：①**寒气→冻结循环**（普通攻击叠寒气，叠满冻结玩家，需主动攻击解除）逼迫玩家不能无限后撤；②**冰霜重击 AOE**（以 boss 为中心、范围伤害+击退，可击碎冰墙/冻结墙）替换部分普攻循环；③**狂暴预警→冲锋**（HP≤40% 后冰霜重击循环替换为预警一回合、下回合直线冲锋）作为残血阶段终结风筝的手段。

### 冰面地形（v1，保留）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 冰面生成间隔 | 每 **4** 个怪物回合的近战命中后触发（复用原冰冻间隔常量） | `FROST_GIANT_FREEZE_INTERVAL` |
| 冰面范围 | 以**玩家当前格**为中心、曼哈顿距离 ≤ **1**（「+」字 5 格，跳过障碍/怪物格） | `FROST_GIANT_ICE_RADIUS` |
| 冰面存续 | **2** 回合后融化（`remaining` 倒计时，由 `ExpeditionState.endTurn` 统一移除） | `FROST_GIANT_ICE_DURATION` |
| 踩冰滑行 | 玩家**站在**冰面上移动时，沿方向**连续滑行**到「第一个非冰可走格」；撞墙/石块/冰墙(含冻结墙)/怪物则停在障碍前。整段滑行只收 1 次移动 AP，沿途揭雾，确定性无 RNG。从非冰格踏上冰面只算普通一步（下回合站冰上才滑） | `MovementSystem.applyMove()` / `ICE_TILE` 实体 |

行为节奏：每 4 回合一次「普攻 + 以玩家为中心铺冰」。冰面对称铺开 → 玩家任意方向后撤都会**过冲到冰面边缘**，丢掉风筝赖以生存的精确间距；巨人本身不滑、稳步推进，趁玩家失控期落拳。冰面不造成伤害，纯改变移动。

### 寒气→冻结循环（v2，2026-06-15）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 寒气叠加 | 普通近战攻击命中玩家 +1 层寒气，emit `CHILL_STACK_APPLIED{stacks}` | — |
| 冻结阈值 | 叠满 **3** 层时归零并冻结玩家（emit `CHILL_STACK_APPLIED{stacks:0}` + `PLAYER_FROZEN{wallEntityIds}`） | `FROST_GIANT_CHILL_STACKS_TO_FREEZE` |
| 冻结效果 | `playerFrozen=true`：`MovementSystem.applyMove` 完全 no-op（MOVE 无效），需主动攻击解除 | — |
| 冻结墙 | 冻结触发的同时在玩家周围生成 **2** 个 `FREEZE_WALL`（与 `ICE_WALL` 一样阻挡移动、可被冰霜重击/狂暴冲锋击碎） | `FROST_GIANT_FREEZE_WALL_COUNT` |
| 解除方式 | 玩家主动攻击（`playerAttack` 命中怪物 或 `attackIceWall`）每次消耗 1 次，共 **3** 次后解除：`playerFrozen=false`、移除全部 `FREEZE_WALL`，emit `PLAYER_UNFROZEN` | `FROST_GIANT_FREEZE_ATTACKS_TO_BREAK` |

设计意图：风筝的核心是「打一下立刻后撤」。冻结期间 MOVE 完全失效，玩家只能选择「站桩对打解冻」或承受冻结期间的后续攻击，逼迫近战互动；冻结墙进一步压缩冻结期间的可视/可走空间。

### 冰霜重击 AOE（v2，非狂暴循环回合）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发间隔 | 每 **3** 个怪物回合（非狂暴），**替换**本回合普攻 | `FROST_GIANT_HEAVY_STRIKE_INTERVAL` |
| AOE 范围 | 以 boss **自身**为中心，曼哈顿半径 ≤ **2** | `FROST_GIANT_HEAVY_STRIKE_RADIUS` |
| 冰墙连锁 | 范围内所有未消耗的 `ICE_WALL`/`FREEZE_WALL` 全部击碎（emit `ICE_WALL_SHATTERED`），其四周「+」字生成 `SHATTERED_ICE` | `FROST_GIANT_SHATTERED_ICE_DURATION` |
| 命中玩家 | 造成 `boss.attack` 伤害（不计护甲，emit `PLAYER_DAMAGED`），未致死则沿 boss→玩家方向击退 **1** 格（emit `KNOCKBACK`） | `FROST_GIANT_KNOCKBACK_DISTANCE` |
| 击退落点为冰面 | 沿击退方向**滑行到边缘**，并额外造成 **30** 点固定伤害 | `FROST_GIANT_ICE_SLIDE_DAMAGE` |
| 释放后 | emit `FROST_HEAVY_STRIKE_RESOLVED{bossId, center, radius}`；boss 朝玩家贪心追击 **1** 步（受阻则停留） | — |

`SHATTERED_ICE`（碎冰地块）：玩家踩入立即消耗，造成 **30** 点固定伤害（`FROST_GIANT_SHATTERED_ICE_DAMAGE`），不阻挡移动；**5** 回合后自动消失（`remaining` 倒计时，`ExpeditionState.endTurn` 统一移除）。

设计意图：冰霜重击以 boss 自身为中心而非玩家为中心，玩家无法靠"贴脸"完全规避；冰墙连锁使清障收益与重击节奏绑定，击退+冰面滑行追加伤害让"贴脸打一下退一步"的退一步本身变得有风险。

### 狂暴：预警→冲锋（v2，HP ≤ 40%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发阈值 | HP/maxHp 首次 ≤ **40%** 时 emit `BOSS_ENRAGED{bossId:'FROST_GIANT'}` | `FROST_GIANT_ENRAGE_HP_RATIO` |
| 循环替换 | 冰霜重击循环（每 3 个怪物回合）替换为「预警 → 冲锋」两回合循环 | — |
| 预警 | 循环回合本回合**不攻击不移动**，记录方向（boss→玩家主导轴）与路径，emit `CHARGE_TELEGRAPHED{bossId, dir, path}` | — |
| 冲锋 | 下一怪物回合沿预警方向逐格推进，按「三格宽车道」（中心线 + 垂直方向 ±1）逐格判定 | — |
| 车道命中冰墙 | 优先判定：首个 `ICE_WALL`/`FREEZE_WALL` 被击碎（同冰霜重击的击碎+生成 `SHATTERED_ICE`）并停止，emit `CHARGE_EXECUTED{result:'WALL_SHATTERED'}` | — |
| 车道命中玩家 | 造成 `boss.attack × 2` 伤害并停止，emit `CHARGE_EXECUTED{result:'PLAYER_HIT'}` | `FROST_GIANT_CHARGE_DAMAGE_MULT` |
| 均未命中 | 冲到路径终点，在地图随机空格生成 1 个新 `ICE_WALL`（消耗 RNG，AC-13），emit `CHARGE_EXECUTED{result:'ICE_WALL_SPAWNED'}` | — |

设计意图：残血阶段的直线冲锋是全图范围的强制位移压力，车道判定（三格宽）让"躲在侧后方"也有较高概率被覆盖；冲锋途中新增的冰墙持续为后续回合提供新的击碎/冲锋素材，避免残局后期场上冰墙耗尽导致狂暴循环退化为纯位移。

### 冰墙地形（第 3 章 Boss 房）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 冰墙数量 | **3** 个，进入 Boss 房（第 15 层）时生成 | `CHAPTER3_ICE_WALL_COUNT` |
| 冰墙 HP | **10** | `CHAPTER3_ICE_WALL_HP` |
| 移动到冰墙/冻结墙格 | no-op（位置不变，AP 不扣） | — |
| 攻击冰墙（`attackIceWall`） | 扣减 HP，不掉灵气、不消耗 RNG；HP=0 时 `consumed=true`，emit `ICE_WALL_BROKEN`，玩家获得灵气 **+1** | `CHAPTER3_ICE_WALL_DROP_ANIMA` |
| 被冰霜重击/狂暴冲锋击碎 | `ICE_WALL`/`FREEZE_WALL` 均可被击碎（`ICE_WALL_SHATTERED`），不掉灵气，四周生成 `SHATTERED_ICE` | — |

设计意图：冰墙阻挡走位、迫使玩家分配 AP 清障，击碎后的灵气奖励补偿清障开销；冻结墙复用同一套阻挡/击碎逻辑，降低实现与认知成本。

## 五、第 4 章 Boss：熔岩领主（LavaLord.ts，第 20 层）

> **2026-06-15 机制重做**：原机制（普攻附加灼烧、纯叠加无上限 + 阶段二随机撒熔岩格）单调且缺乏方向感。本次重做为「阶段一喷发预警 + 阶段二定向潮汐 + 灼烧终结(熔核爆裂) + 熔岩锁链(反风筝)」四件套。详见 `specs/260615-lava-lord-rework/design.md`。

### 行动优先级（每个 Boss 回合）

1. 喷发标记/结算（仅阶段一，与普攻并行，不占用行动）
2. 熔岩锁链检查（满足条件则**替换**本回合普攻，跳过 3/4）
3. 定向潮汐推进（仅阶段二，周期性）
4. 普通近战 + 灼烧叠加 + 熔核爆裂检查

### 阶段一：熔火君王（HP > 50%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 灼烧 tick 数/次攻击 | **3** tick（每 tick = 10 HP/回合，×10基准） | `LAVA_LORD_BURN_TICKS` |
| 叠加方式 | 每次攻击命中后 `playerBurnRemaining += LAVA_LORD_BURN_TICKS`（emit `BURN_APPLIED`，达阈值见「熔核爆裂」） | — |
| 灼烧结算时机 | 回合开始逐点消耗（`ExpeditionState.endTurn` 处理） | — |
| 喷发标记周期 | `turn % LAVA_LORD_ERUPTION_INTERVAL(3) === 0` 时标记 | `LAVA_LORD_ERUPTION_INTERVAL` |
| 喷发标记范围 | 以玩家**当前格**为中心 **4×4**（`x,y∈[-1,+2]`，裁剪出图边界），emit `ERUPTION_TELEGRAPHED{cells}` | — |
| 喷发结算 | 下一个 Boss 回合在标记 cells 上生成临时 `LAVA_TILE`（跳过被占用格），emit `ERUPTION_RESOLVED{tiles,duration}` | — |
| 喷发熔岩持续 | **3** 回合后自动消失 | `LAVA_LORD_ERUPTION_DURATION` |

行为节奏：每次近战攻击附带灼烧 DOT；每 3 回合标记一次范围、下回合在标记区生成临时熔岩——逼玩家提前看预警走位，否则站桩磨血会被熔岩"追加"地形压力。

### 灼烧终结：熔核爆裂

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 触发阈值 | `playerBurnRemaining >= LAVA_LORD_BURN_BURST_THRESHOLD(6)`（普攻每次 +3，2 次命中即触发） | `LAVA_LORD_BURN_BURST_THRESHOLD` |
| 触发效果 | `playerBurnRemaining` 清零；造成 `层数 × LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK(5)` 点**真实伤害**（可致死，emit `BURN_BURST{damage,hp,tiles}`） | `LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK` |
| 周边地形 | 玩家周围"+"字 4 格生成临时 `LAVA_TILE`（跳过被占用格） | — |
| 临时熔岩持续 | **3** 回合后自动消失 | `LAVA_LORD_BURN_BURST_TILE_DURATION` |

设计意图："贪刀两下不脱离就自伤+周边变雷区"——限制无脑叠刀，逼玩家在灼烧快到阈值时主动脱离。

### 阶段二：定向熔岩潮汐（HP ≤ 50%，不可逆）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 阶段触发阈值 | Boss HP/maxHp ≤ **50%**，进入后不可逆；喷发预警停用（已挂起标记直接清空不结算） | `CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO` |
| 推进方向 | 取 Boss 当前位置到地图四边最近一边（距离相同按 `UP>DOWN>LEFT>RIGHT` 优先级），不可变 | — |
| 首排 | 进入阶段二当回合立即在该边整条边界（10格）生成**永久** `LAVA_TILE`（跳过被占用格），emit `LAVA_TIDE_ROW_SPAWNED{tiles,direction,rowIndex:1}` | — |
| 推进间隔 | 此后每 **3** 个 Boss 回合沿同方向再推进一整排 | `CHAPTER4_LAVA_TIDE_INTERVAL` |
| 最大排数 | 最多推进 **3** 排，达到后停止（已生成格子永久保留） | `CHAPTER4_LAVA_TIDE_ROW_MAX` |
| 踩入伤害 | 玩家踩入任意 `LAVA_TILE`（含永久格）**-5 HP**（回合结束结算，emit `LAVA_TILE_DAMAGED`） | `CHAPTER4_LAVA_TILE_DAMAGE` |
| Boss 站熔岩·攻击 | Boss 站在 `LAVA_TILE` 上时普攻 **+1** | `LAVA_LORD_LAVA_STAND_ATTACK_BONUS` |
| Boss 站熔岩·减伤 | Boss 站在 `LAVA_TILE` 上时受到的玩家伤害 **-20%**（向上取整保留至少1） | `LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION` |

设计意图：残血阶段地面从 Boss 所在边开始定向、永久地"吞没"安全区，逼玩家持续向反方向退却而非原地风筝；Boss 主动站熔岩可换取攻防双buff，给玩家"引诱 Boss 离开熔岩"的博弈空间。

### 熔岩锁链（反风筝）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 远离计数器 | 每个 Boss 回合若 `manhattan(player,boss) > 1` 则 `+1`，`<=1` 归零 | `lavaLordChainCounter` |
| 触发条件 | 计数器 `>= LAVA_LORD_CHAIN_TURN_THRESHOLD(3)` 或当前距离 `>= LAVA_LORD_CHAIN_DISTANCE_THRESHOLD(4)`（任一满足） | `LAVA_LORD_CHAIN_TURN_THRESHOLD` / `LAVA_LORD_CHAIN_DISTANCE_THRESHOLD` |
| 触发效果 | **替换**本回合普攻与潮汐推进：玩家沿 `boss→player` 方向被拉近 1 格（落点越界/被占据则跳过位移，仅加灼烧），附加 `LAVA_LORD_CHAIN_BURN_TICKS(2)` 层灼烧（emit `LAVA_CHAIN_PULL{from,to,burnTotal}`，可能连锁触发熔核爆裂），计数器归零 | `LAVA_LORD_CHAIN_BURN_TICKS` |
| 追击保留（2026-06-16） | 锁链触发回合 Boss 仍朝玩家追击移动一格（`chaseMoveOnly`），避免"Boss 原地不动 → 玩家被拉一格再走开 → 下回合再次锁链"的死循环 | — |

设计意图：远离 Boss 过久（或瞬间拉开过远）会被强制拉近+附加灼烧，堵住"打一下退三格"的无伤风筝。

## 六、第 5 章 Boss：命运守卫（FateGuardian.ts，第 25 层）

> **2026-06-14 反风筝**：原 40% 闪避删除，改为命运预言。
> **2026-06-16 三段重做**：HP ≤ 50% 引入「行为镜像」（替换原跟随型镜像）；HP ≤ 30% 进入狂暴态，开启「改写命运」周期。详见 `specs/260616-fate-guardian-rework/design.md`。

三段状态机：

| 阶段 | HP 范围 | 已有机制 | 新增/变更 |
|------|---------|----------|-----------|
| **常态** | 100% – 50% | 普通近战、高血量×2、命运预言（3×3） | 不变 |
| **镜像段** | 50% – 30% | 上述全部 | HP 首次跨过 50% → 生成 1 个**行为镜像** |
| **狂暴段** | ≤ 30% | 普通近战、高血量×2、行为镜像继承 | HP 首次跨过 30% → 清空命运预言、命运预言此后停摆、开启「改写命运」周期 |

### 6.1 常态机制

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 高血量惩罚阈值 | 玩家 HP > **50%** maxHp 时，守卫伤害 **×2**（三段全程保留） | `FATE_GUARDIAN_HP_THRESHOLD` |
| 命运预言间隔 | 每 **3** 个怪物回合标记一次（仅非狂暴态） | `FATE_PROPHECY_INTERVAL` |
| 预言机制 | **标记回合**：记录玩家**当前格**为中心（emit `PROPHECY_MARKED`）；**下个** Boss 回合该 **3×3** 区域爆炸（emit `PROPHECY_RESOLVED`），玩家若仍在区域内受 `round(boss.attack × 1.0)` 伤害。「先结算、后标记」保证提前 1 个怪物回合预警 | `FATE_PROPHECY_RADIUS` / `FATE_PROPHECY_DAMAGE_MULT` / `fateProphecyStep()` |

### 6.2 行为镜像（HP 跨 50%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 生成阈值 | Boss HP/maxHp 跨过 **50%** 时生成 1 次，之后即使镜像被击杀也不再生成 | `FATE_MIRROR_SPAWN_HP_RATIO=0.5` / `boss.mirrorSpawned` |
| 镜像 HP / 攻击 | 玩家当前 HP / attack **× 0.5**（诞生瞬间快照，镜像自适应玩家强度） | `FATE_MIRROR_HP_FROM_PLAYER` / `FATE_MIRROR_ATK_FROM_PLAYER` |
| 镜像反打距离 | 曼哈顿距离 ≤ **2** 命中，> 2 空挥（emit `MIRROR_ATTACKED{hit:false}`） | `FATE_MIRROR_ATTACK_RANGE` |
| 行为复制规则 | ATTACK > MOVE > IDLE 互斥优先级，按上回合玩家行为执行（攻击/移动/获盾） | `recordPlayerActionForMirror` / `mirrorBehaviorStep` |
| 护盾 | IDLE 时获得 1 层护盾（不叠加），吸收下一次伤害 | `shieldStacks` |
| 镜像被击杀 | emit `MIRROR_KILLED`，不掉落、不触发传送门 | — |

镜像复制三种行为：
- **玩家攻击** → 镜像下个怪物回合朝玩家反打（曼哈顿 ≤ 2 命中、用 `mirror.attack` 结算、受 ARMOR 减伤、吃 Boss E2 加伤 buff）。
- **玩家移动 N 格** → 镜像下个怪物回合朝玩家方向最短路径推进 N 格（遇墙/怪/玩家占位停）。
- **玩家待机**（未攻击且净位移=0） → 镜像下个怪物回合获 1 层护盾。

### 6.3 狂暴态 + 改写命运（HP 跨 30%）

| 数值 | 当前值 | 变量 |
|------|--------|------|
| 狂暴阈值 | Boss HP/maxHp 跨过 **30%** → emit `BOSS_ENRAGED` + 清空 `fateProphecy` + 停止命运预言 | `FATE_ENRAGE_HP_RATIO` / `boss.enraged` / `enrageTurn` |
| 改写命运间隔 | 狂暴起每 **3** 个怪物回合触发一次预告 | `DESTINY_REWRITE_INTERVAL` |
| 流程 | T0 怪物回合 5 抽 3 写 `pendingDestinyRewrite`（emit `DESTINY_REWRITE_OFFERED`）→ T1 玩家回合阻塞模态选弃 1 → T2 怪物回合按 **E5→E4→E3→E1→E2** 顺序结算剩 2 | `tryOfferDestinyRewrite` / `chooseDestinyRewrite` / `resolveDestinyRewrite` |
| E1 Boss 回血 | maxHp × **10%** | `DESTINY_HEAL_RATIO` |
| E2 Boss 加伤 | 攻击 **+30%**，持续 3 个怪物回合（普攻/镜像攻击/下次 5×5 都吃） | `DESTINY_ATK_BUFF_PCT` / `DESTINY_ATK_BUFF_DURATION_TURNS` |
| E3 玩家扣血 | `round(boss.attack × 1.0)`，无视防御 | `DESTINY_DIRECT_DMG_MULT` |
| E4 5×5 爆炸 | 中心 = **Boss 当前格**，切比雪夫 ≤ 2 命中，伤害 = `round(boss.attack × 1.2)` | `DESTINY_5X5_RADIUS` / `DESTINY_5X5_DMG_MULT` |
| E5 命运封锁 | 玩家下个玩家回合 AP `max(1, floor(ap/2))` | `floor.destinyLockNextTurn` |

设计意图：
- 三段递进让 25 层最终 Boss 从单层机制升级为「常态→镜像→狂暴」三段博弈，每段都强制玩家调整策略。
- 行为镜像让"攻击/移动/待机"三种行为都有代价，玩家被迫思考节奏。
- 改写命运让残血段（30%→0%）成为全战最紧绷的阶段，符合"残血更危险"的设计原则。
- 镜像数值自适应玩家强度，强玩家面对强镜像、弱玩家面对弱镜像。

## 七、跨 Boss 共性与差异总结

| Boss | 章节 | 核心机制类型 | 是否影响地形 | 是否召唤增援 |
|------|------|--------------|--------------|--------------|
| 哥布林酋长 | 1 | 近战追击（射程1）+ AOE 范围伤害 | 是（石块） | 是（哥布林战士） |
| 流沙巨蝎 | 2 | 周期性免疫 + 突袭双倍（落点永久沙坑）+ 流沙扩张 + 沙暴真实伤害（反风筝）+ 残血狂暴（潜地更频/沙暴更广） | 是（静态/动态/永久沙坑） | 否 |
| 冰霜巨人 | 3 | 冰面滑行 + 寒气冻结 + 冰霜重击 AOE/击退 + 残血预警冲锋（反风筝 v2，2026-06-15） | 是（冰面 + 冰墙/冻结墙 + 碎冰） | 否 |
| 熔岩领主 | 4 | 喷发预警 + 灼烧爆裂(熔核爆裂) + 残血定向潮汐 + 熔岩锁链(反风筝)（2026-06-15 重做） | 是（临时/永久熔岩格） | 否 |
| 命运守卫 | 5 | 高血双倍 + 命运预言（反风筝）+ 行为镜像（HP≤50%）+ 狂暴改写命运（HP≤30%，5 抽 3 弃 1） | 是（预言 AOE + 5×5 爆炸） | 是（行为镜像） |

> **2026-06-14 反风筝重做小结**：第 2/3/5 章 Boss 此前是「改良版纯近战」（流沙巨蝎除潜地外、冰霜的 AP-4、命运的倍率/闪避），其「改良部分」恰恰能被「打一下退一格」的无伤风筝绕过失效。本次为三者各加一套**不依赖赢得走位博弈**的压迫手段（流沙地形 / 冰面滑行 / 预言 AOE），让玩家「换打法」而非「被系统禁止风筝」。第 1 章哥布林已抗住、第 4 章熔岩仅做焰格 3→6 调整。详见 `specs/260614-boss-anti-kite/design.md`。
>
> **2026-06-15 熔岩领主重做小结**：原阶段一仅"普攻附加灼烧"、阶段二仅"周期性随机撒 6 个熔岩格"，灼烧无上限纯叠加、阶段二随机撒点缺乏方向感。本次重做为「喷发预警(阶段一 4×4 提前 1 回合标记) + 熔核爆裂(灼烧叠满 6 层强制爆发+周边变雷区) + 定向潮汐(阶段二从 Boss 所在边整排推进永久熔岩，最多 3 排) + 熔岩锁链(远离/距离触发拉近+灼烧，反风筝)」四件套，原 `CHAPTER4_LAVA_TIDE_TILE_COUNT`/`CHAPTER4_LAVA_TIDE_DURATION` 删除、原 `LAVA_TIDE_SPAWNED` 事件由 `LAVA_TIDE_ROW_SPAWNED` 取代。详见 `specs/260615-lava-lord-rework/design.md`。

## 八、Boss 掉落统一结构（2026-06-15 重做）

> 实现：`assets/scripts/pve/core/LootSystem.ts::applyBossKillDrop` + `bosses/BossSpoils.ts` + `RelicSystem.ts` + `ScrollSystem.ts`。

每个 Boss 击杀掉落 = **通用必掉 + 专属随机 1 件 + 稀有独立判定**，跨 5 章统一。

### 8.1 通用必掉（100%）

| 项 | 第 1 章基准 | 章节缩放（×1 / ×1.2 / ×1.5 / ×1.8 / ×2.2）|
|----|------|------|
| 金币 | 100 | 100 / 120 / 150 / 180 / 220 |
| 灵气 | 30  | 30 / 36 / 45 / 54 / 66 |

灵气走 `addAnima` 通道，可能连锁触发 `ANIMA_STRENGTHEN` 强化弹窗。常量见 `BOSS_DROP_BASE` / `BOSS_DROP_CHAPTER_MULT` / `bossDropScaled()`。

### 8.2 专属随机 1 件（100%）

每 Boss 设 3 件专属道具，击杀时等概率随机给 1 件并自动装备到对应槽位。无玩家选择（增加重复挑战乐趣）。表见 `bosses/BossSpoils.ts::BOSS_SPOILS`：

| Boss | 件 1 | 件 2 | 件 3 |
|------|------|------|------|
| 哥布林酋长 (RARE) | 哥布林酋长战斧 WEAPON +30 / 吸血 | 战争号角 TRINKET +15 / 召唤 | 破旧王冠 HELMET +60 / 受击眩晕 |
| 流沙巨蝎 (EPIC) | 毒蝎尾刺 WEAPON +50 / 流血 | 流沙护腿 SHOES +4 / 沙坑免疫 | 甲壳护符 TRINKET +20 / 物理 -15% |
| 冰霜巨人 (EPIC) | 寒冰巨剑 WEAPON +50 / 减速 | 霜甲战盔 HELMET +100 / 冰面减伤 | 永冻指环 TRINKET +20 / 主动铺冰 |
| 熔岩领主 (LEGENDARY) | 熔岩战锤 WEAPON +80 / 灼烧 | 焰心护胸 ARMOR +60 / 灼烧免疫 | 烈焰指环 TRINKET +30 / 击杀回血 |
| 命运守卫 (LEGENDARY) | 命运之刃 WEAPON +80 / 15% 暴击 ×2 | 预言面具 HELMET +140 / 显示意图 | 守卫圣盾 TRINKET +30 / 致死复活 |

trait id 命名规范 `boss_<效果>_<数值>`（例：`boss_burn_on_hit` / `boss_revive_50`），效果实现挂钩到 `EquipTraitEffects.ts` / `CombatSystem.ts`（部分占位待后续补全）。

### 8.3 稀有独立判定（互不影响，顺序固定保证 AC-13）

| 项 | 概率 | 行为 |
|----|------|------|
| 命运碎片 | 10% | 数量按章节缩放（3 / 4 / 5 / 6 / 7），emit `SHARDS_PICKUP`；实际入账由远征结束云函数统一发放 |
| 命运词条卷轴 | 30% | `player.scrolls += 1`，emit `SCROLL_PICKUP`；HUD 可主动使用（`useScroll()` → `SCROLL_OFFER` 三选一 → `claimScrollChoice()` 复用职业强化池但不消耗灵气阈值） |
| Boss 遗物 | 基础 20% + 图鉴已解锁 +10% (= 最高 30%) | 按 `CHAPTER_BOSS_RELIC[chapter]` 给本章遗物，emit `RELIC_PICKUP`；首次解锁时同步 emit `CODEX_RELIC_UNLOCKED`（写入 `PveMeta.codex.relics` 持久化） |

常量：`BOSS_RARE_DROP` / `CHAPTER_BOSS_RELIC`。

### 8.4 Boss 遗物清单（本场远征局内 buff，死亡清空）

| 章 | 遗物 | 效果 | 挂钩 |
|----|------|------|------|
| 1 | 酋长怒吼 (CHIEF_ROAR) | 击杀任意怪物后下一次普攻 +50% 伤害 | `relicOnKill` → `relicComputeAttackBonus` |
| 2 | 流沙之心 (QUICKSAND_HEART) | 每进入新房间随机生成 2 格流沙（存续 6 回合）；站流沙上攻击 +10 | `relicOnNewFloor` → `relicComputeAttackBonus` |
| 3 | 永冻之核 (PERMAFROST_CORE) | 每移动 3 步后下次普攻附带冰冻（敌人下回合无法行动） | `relicOnMoveStep` → `relicOnHitTarget` → `applyFreezeToMonsters` → `stepOneMonsterCore` 冰冻分支 |
| 4 | 熔火之心 (MAGMA_HEART) | 受到伤害时反弹 30% 给攻击者（向上取整最低 1） | `relicReflectDamage`（在 `monsterAttack` 反击/伤害结算后） |
| 5 | 命运回响 (FATE_ECHO) | 每场远征首次致死兜底，回复 30% maxHp（优先级低于 BERSERKER 不屈） | `relicTryRevive`（`monsterAttack` dead 分支） |

实现见 `RelicSystem.ts`；玩家状态字段 `RunPlayer.relics` / `relicState` / `codexRelics`。

### 8.5 营地遗物宝箱（钻石消费入口）

每个营地 modal 弹窗（Boss 击杀后触发）绑定刚通关 Boss 的章节，宝箱**只能开出该章节的遗物**：

| 项 | 当前值 |
|----|------|
| 单次开箱花费 | 1000 金币 + 50 钻石 |
| 开出本章遗物概率 | 10%（剩余 90% 为"未中"，资源不退） |
| 已持有该遗物时 | 强制走"返还"分支：金币与钻石各退 30%（避免重复无意义） |

实现：`CampSystem.ts::openRelicChest(state, currentDiamond)` 返回 `{ state, events, diamondDelta }`；Controller 在 `_handleFloorCleared` 的 `showCamp` 回调里调用，并通过 `updatePveMeta({ diamond: delta })` 同步云端钻石余额。云端在 `db.js::updateUserPveMeta` 做边界校验（余额 < 0 时抛 `INSUFFICIENT_DIAMOND`）。

### 8.6 设计意图

- **三层结构**让每次击杀 Boss 都有「保底确定收益」（通用 + 专属）+ 「惊喜不确定收益」（稀有三独立判定），既稳定又有刷子动力
- **专属随机不让选**：玩家不能"看一眼跳过"，每次都得在 3 件中接受随机结果——增加重复挑战的乐趣
- **遗物 = 局内 buff + 图鉴长线**：单局结束就丢，但首次拾取永久记录到图鉴，后续掉落 +10% —— 鼓励长线积累且不让强力 buff 跨局滚雪球
- **遗物宝箱让钻石有用**：此前钻石只进不出，本次设计填补了"钻石→局内强度"的消费循环，且按章节绑定避免开宝箱跳章打破节奏
