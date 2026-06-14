# 命运远征 数值参考手册

> 唯一数值来源：`assets/scripts/pve/core/PveConstants.ts` + `EquipmentSystem.ts` + 各 Boss 文件。
> **每次调整数值后必须同步更新本文档。**
> 最后更新：2026-06-10（M1 起所有伤害/生命/护甲/治疗数值统一 ×10，AP/金币/灵气/百分比/倍率不变）

---

## 一、玩家基础

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 初始 HP | 200（×10基准，原20） | `INITIAL_HP` | PveConstants.ts |
| 初始金币 | 0 | `INITIAL_GOLD` | PveConstants.ts |
| 初始灵气 | 0 | `INITIAL_ANIMA` | PveConstants.ts |
| 初始职业 | ADVENTURER | `INITIAL_CLASS` | PveConstants.ts |
| 基础攻击力 | 10（×10基准，原1） | `BASE_ATTACK` | PveConstants.ts |
| 基础攻击范围 | 1（曼哈顿距离） | `BASE_ATTACK_RANGE` | PveConstants.ts |

---

## 二、行动点（AP）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 每回合基础 AP | 8 | `AP_BASE` | PveConstants.ts |
| 骰子范围 | 1~6 | `DICE_MIN` / `DICE_MAX` | PveConstants.ts |
| 每回合总 AP 范围 | **9~14** | （AP_BASE + 骰子） | — |
| 移动消耗 | 2 AP/格 | `AP_COST.MOVE` | PveConstants.ts |
| 普通攻击消耗 | **3** AP/次 | `AP_COST.ATTACK` | PveConstants.ts |
| 开宝箱 | 1 AP | `AP_COST.OPEN_CHEST` | PveConstants.ts |
| 开出口门 | 1 AP | `AP_COST.OPEN_EXIT` | PveConstants.ts |
| 使用神像 | 1 AP | `AP_COST.USE_IDOL` | PveConstants.ts |
| 使用温泉 | 1 AP | `AP_COST.USE_HOT_SPRING` | PveConstants.ts |
| 使用祭坛 | 1 AP | `AP_COST.USE_ALTAR` | PveConstants.ts |

---

## 三、怪物基础数值

所有数值乘以章节倍率（见下方"章节缩放"）。

| 类型 | HP | 攻击 | 攻击范围 | 感知半径 | 变量 | 文件 |
|------|-----|------|----------|----------|------|------|
| 普通怪 NORMAL | 40 | 10 | 1 | 3 | `MONSTER_BASE.NORMAL` | PveConstants.ts |
| 灵气怪 ANIMA | 30 | 0 | 0 | 6 | `MONSTER_BASE.ANIMA` | PveConstants.ts |
| 精英怪 ELITE | 80 | 20 | 1 | 4 | `MONSTER_BASE.ELITE` | PveConstants.ts |
| Boss BOSS | **300** | **30** | 1 | 99（全图） | `MONSTER_BASE.BOSS` | PveConstants.ts |

### 章节缩放（hpMult / attackMult）

**普通 / 精英 / 灵气怪**（`chapterScaling()`）：

| 章节 | 倍率 |
|------|------|
| 1 | ×1.0 |
| 2 | ×1.4 |
| 3 | ×2.0 |
| 4 | ×2.8 |
| 5 | ×3.8 |

**Boss 专属**（`bossChapterScaling()`，PveConstants.ts）：

| 章节 | 倍率 |
|------|------|
| 1 | ×1.5 |
| 2 | ×2.2 |
| 3 | ×3.0 |
| 4 | ×3.8 |
| 5 | ×4.5 |

> 哥布林酋长 HP 直接使用 `GOBLIN_CHIEF_HP=500`（固定值，不再乘以章节倍率，×10基准，原50），攻击仍走 bossChapterScaling(1)=×1.5 → 攻击=`Math.round(30×1.5)=45`（×10基准，原5）

---

## 四、每层怪物数量

**第 2-5 章通用规则（generic）：**

| 类型 | 数量 | 变量 | 文件 |
|------|------|------|------|
| 普通怪 | 4 | `NORMAL_MONSTER_COUNT` | MapGenerator.ts |
| 灵气怪 | 1 | `ANIMA_MONSTER_COUNT` | PveConstants.ts |
| 精英怪 | 1 | `ELITE_MONSTER_COUNT` | PveConstants.ts |

**第 1 章专属规则（`CHAPTER1_FLOOR_MONSTERS`，Chapter1Monsters.ts / MapGenerator.ts）：**

| 层 | 怪物组成 |
|----|----------|
| 1 | 哥布林战士×3 + 灵鼠×1 |
| 2 | 哥布林战士×2 + 哥布林弓箭手×2 + 灵鼠×1 |
| 3 | 哥布林战士×3 + 赤炎哥布林×1 + 灵鼠×1 |
| 4 | 哥布林弓箭手×3 + 冰霜哥布林×1 + 灵鼠×1 |
| 5 | Boss 哥布林酋长 + 石块×2 |

### 第 1 章专属怪物数值（Chapter1Monsters.ts）

| 变体 ID | 类型 | HP | 攻击 | 范围 | 感知 | 特殊效果 | 变量 |
|---------|------|----|------|------|------|----------|------|
| GOBLIN_WARRIOR | NORMAL | 40 | 10 | 1 | 3 | 无 | `makeGoblinWarrior` |
| GOBLIN_ARCHER | NORMAL | 30 | 10 | 3 | 4 | 远程单位 | `makeGoblinArcher` |
| FROST_GOBLIN | ELITE | 90 | 20 | 3 | 4 | **冰霜**：被击中后移动AP+1持续2回合（可叠加） | `makeFrostGoblin` |
| FIRE_GOBLIN | ELITE | 120 | 20 | 2 | 4 | **灼烧**：被击中后每回合5HP持续2回合（可叠加，×10基准，原0.5HP） | `makeFireGoblin` |
| SPIRIT_RAT | ANIMA | 30 | 0 | 0 | 3 | 感知3格即逃，每次移动2格 | `makeSpiritRat` |

**冰霜/灼烧常量（PveConstants.ts）：**

| 常量 | 值 | 含义 |
|------|-----|------|
| `FROST_MOVE_PENALTY_ROUNDS` | 2 | 冰霜持续回合数 |
| `FIRE_BURN_ROUNDS` | 2 | 灼烧持续回合数（每回合 5HP，×10基准，原0.5HP） |
| `HEAVY_AOE_SLOW_ROUNDS` | 2 | 重击余波减速持续回合数 |

---

## 五、怪物掉落

### 普通怪掉落概率

| 结果 | 概率 | 范围 | 变量 | 文件 |
|------|------|------|------|------|
| 仅金币 | 50% | 5~12 | `NORMAL_MONSTER_DROP.GOLD_ONLY` / `goldSmall` | PveConstants.ts |
| 仅灵气 | 25% | 10~25 | `NORMAL_MONSTER_DROP.ANIMA_ONLY` / `animaSmall` | PveConstants.ts |
| 金币+灵气 | 25% | 同上 | `NORMAL_MONSTER_DROP.GOLD_AND_ANIMA` | PveConstants.ts |
| 额外装备（独立判定） | 3% | COMMON 品质 | `NORMAL_MONSTER_DROP.EQUIP_CHANCE` | PveConstants.ts |

### 灵气怪掉落

| 结果 | 概率 | 范围 | 变量 | 文件 |
|------|------|------|------|------|
| 大量灵气 | 100% | 40~60 | `ANIMA_MONSTER_DROP.animaLarge` | PveConstants.ts |

### 精英怪掉落概率

| 结果 | 概率 | 范围 | 变量 | 文件 |
|------|------|------|------|------|
| 仅金币（中等） | 40% | 15~30 | `ELITE_MONSTER_DROP.GOLD_ONLY` / `goldMid` | PveConstants.ts |
| 金币+灵气 | 30% | 15~30金/20~40灵 | `ELITE_MONSTER_DROP.GOLD_AND_ANIMA` | PveConstants.ts |
| 大量金币 | 15% | 35~60 | `ELITE_MONSTER_DROP.GOLD_HIGH` / `goldHigh` | PveConstants.ts |
| 装备 | 10% | — | `ELITE_MONSTER_DROP.EQUIP` | PveConstants.ts |
| 职业碎片对 | 5% | 2个不同职业各+1 | `ELITE_MONSTER_DROP.FRAGMENT_PAIR` | PveConstants.ts |

---

## 六、职业数值

进阶条件：同职业碎片 5 个（`CLASS_FRAGMENTS_TO_ADVANCE`，V2节奏调整）；每普通层随机生成 2 个碎片（`FRAGMENT_COUNT`），同层2个碎片职业互不相同。详见 `specs/game-design/职业系统V1.md` §二。

| 职业 | 攻击加成 | 攻击范围加成 | 移动加成 | 进阶 HP 代价 | 变量 | 文件 |
|------|----------|------------|----------|------------|------|------|
| ADVENTURER（初始） | +0 | +0 | +0 | 0 | `CLASS_STATS.ADVENTURER` | PveConstants.ts |
| BERSERKER | **+15**（×10基准，原+1.5） | +0 | +0 | **max(30, 当前HP÷2下取整)，保底剩1血**（×10基准，原最少扣3） | `ClassSystem.ts applyClassAdvance` | ClassSystem.ts |
| ARCHER | +5（×10基准，原+0.5） | **+2** | +0 | 0 | `CLASS_STATS.ARCHER` | PveConstants.ts |
| ROGUE | +10（×10基准，原+1） | +0 | **+1格/AP** | 0 | `CLASS_STATS.ROGUE` | PveConstants.ts |

> 攻击力 = `BASE_ATTACK(10)` + 职业攻击加成 + 武器 baseStat + 词条加成
> 实际伤害 = `Math.max(10, Math.round(rawAttack))`（×10基准，原 `Math.max(1, ...)`）

---

## 七、职业词条效果

词条在 `CombatSystem.ts` / `MonsterAI.ts` 中内联实现。

| 职业 | 词条 id | 效果 |
|------|---------|------|
| BERSERKER | `life_steal` | 每次攻击回复 10 HP（×10基准，原1） |
| BERSERKER | `berserk` | HP ≤ 50% 时伤害 +10（×10基准，原+1） |
| BERSERKER | `blood_rage` | 击杀目标时回复 20 HP（×10基准，原2） |
| BERSERKER | `undying` | 本层首次将死时保留 1 HP（一次性） |
| BERSERKER | `counter` | 受击时对攻击者造成 10 伤害（×10基准，原1，不触发击杀） |
| ARCHER | `eagle_eye` | 攻击范围 +1 |
| ARCHER | `marksman` | 攻击 +5（×10基准，原+0.5） |
| ARCHER | `multi_shot` | 30% 概率再射一箭（基础伤害，不含加乘） |
| ARCHER | `crit` | 20% 概率三倍伤害 |
| ARCHER | `pierce` | M2 待实现 |
| ROGUE | `backstab` | 移动后首次攻击双倍伤害 |
| ROGUE | `assassin_heart` | 目标非 CHASE 状态时伤害 +20（×10基准，原+2） |
| ROGUE | `afterimage`（被动） | 本层首次受击时闪避（一次性） |
| ADVENTURER | `strengthen_attack_up` | 攻击 +5（×10基准，原+0.5） |

---

## 八、装备数值

装备效果：WEAPON.baseStat → 攻击加成；ARMOR.baseStat → 每次受伤减伤值（最低造成 10 伤害，×10基准，原1）；HELMET.baseStat → maxHp 加成（M2）；TRINKET.baseStat → 金币相关（M2）。

文件：`assets/scripts/pve/core/EquipmentSystem.ts`，变量：`EQUIPMENT_TEMPLATES`

### WEAPON（攻击加成）

| 品质 | 名称 | baseStat | 文件行 |
|------|------|----------|--------|
| COMMON | 生锈短刃 | +10 | EquipmentSystem.ts:17 |
| FINE | 铁制长剑 | +20 | EquipmentSystem.ts:18 |
| RARE | 精钢剑 | +30 | EquipmentSystem.ts:19 |
| EPIC | 英雄之刃 | +50 | EquipmentSystem.ts:20 |
| LEGENDARY | 命运之剑 | +80 | EquipmentSystem.ts:21 |

### ARMOR（减伤值）

| 品质 | 名称 | baseStat | 文件行 |
|------|------|----------|--------|
| COMMON | 皮革轻甲 | -10 | EquipmentSystem.ts:24 |
| FINE | 铁制锁甲 | -20 | EquipmentSystem.ts:25 |
| RARE | 精钢板甲 | -30 | EquipmentSystem.ts:26 |
| EPIC | 英雄铠甲 | -40 | EquipmentSystem.ts:27 |
| LEGENDARY | 命运铠甲 | -60 | EquipmentSystem.ts:28 |

### HELMET（maxHp 加成，M2）

| 品质 | 名称 | baseStat |
|------|------|----------|
| COMMON | 皮革头盔 | +20 |
| FINE | 铁制战盔 | +40 |
| RARE | 精钢头盔 | +60 |
| EPIC | 英雄头冠 | +100 |
| LEGENDARY | 命运王冠 | +140 |

### SHOES（移动 AP 减免 + 品质特效，`MovementSystem.ts` / `MonsterAI.ts`）

baseStat = 移动 AP 减免值（Math.max(1, MOVE-baseStat)），同时按品质解锁叠加特效。  
常量阈值见 `EquipmentSystem.ts`：`SHOES_REVEAL_BONUS_THRESHOLD=2 / SHOES_FIRST_MOVE_THRESHOLD=3 / SHOES_STEALTH_THRESHOLD=4`

| 品质 | 名称 | baseStat | 移动AP | 额外特效 |
|------|------|----------|--------|---------|
| COMMON | 布靴 | 1 | 1 | 无 |
| FINE | 皮靴 | 2 | 1 | 移动后揭示半径 **+1** |
| RARE | 轻捷之靴 | 3 | 1 | 揭示+1 + **每回合首步移动免费（0 AP）** |
| EPIC | 英雄战靴 | 4 | 1 | 揭示+1 + 首步免费 + **怪物仇恨半径 -2** |
| LEGENDARY | 疾风之靴 | 5 | 1 | 揭示+1 + 首步免费 + **怪物仇恨半径 -3** |

### TRINKET（灵气获取加成，`AnimaSystem.ts addAnima()`）

baseStat 直接作为灵气加成百分比。每次获取灵气时乘以 `1 + baseStat/100`，取整。

| 品质 | 名称 | baseStat | 效果 |
|------|------|----------|------|
| COMMON | 幸运铜币 | 5 | 获取灵气 +5% |
| FINE | 财运挂件 | 10 | 获取灵气 +10% |
| RARE | 聚财宝石 | 15 | 获取灵气 +15% |
| EPIC | 英雄徽章 | 20 | 获取灵气 +20% |
| LEGENDARY | 命运碎晶 | 30 | 获取灵气 +30% |

### 装备词条池（铁匠洗炼，`EQUIP_TRAIT_POOL`）

| 词条 id | 效果 | M2？ |
|---------|------|------|
| `equip_atk_up` | 攻击 +10 | 已实现 |
| `equip_def_up` | 防御 +10 | 已实现 |
| `equip_hp_up` | 最大 HP +20 | 已实现 |
| `equip_crit_up` | 暴击率 +5% | M2 待实现 |
| `equip_gold_up` | 拾取金币 +10% | M2 待实现 |
| `equip_swift` | 移动消耗 -1 AP | M2 待实现 |

---

## 九、中性实体数值

| 实体 | 效果 | 数值 | 变量 | 文件 |
|------|------|------|------|------|
| 神像 | 永久 +10 maxHp（×10基准，原+1） | +10 | `IDOL_MAX_HP_BONUS` | PveConstants.ts |
| 温泉 | 当次回满 HP | ×1.0 | `HOT_SPRING_HEAL_RATIO` | PveConstants.ts |
| 祭坛 | 随机获得灵气 | 20~35 | `ALTAR_ANIMA_MIN/MAX` | PveConstants.ts |
| 铁匠强化 | WEAPON/ARMOR/HELMET +10，SHOES/TRINKET +1 baseStat | 20 金 | `BLACKSMITH_UPGRADE_COST` | PveConstants.ts |
| 铁匠洗炼 | 随机换词条 | 30 金 | `BLACKSMITH_REROLL_COST` | PveConstants.ts |

---

## 十、灵气强化

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 初始触发阈值 | 100 | `ANIMA_PER_STRENGTHEN` | PveConstants.ts |
| 阈值递增系数 | ×1.5 | `ANIMA_THRESHOLD_MULTIPLIER` | PveConstants.ts |
| 强化选项数 | 3 选 1 | `STRENGTHEN_CHOICES` | PveConstants.ts |
| 阈值序列 | 100 → 150 → 225 → 337 → … | — | — |

---

## 十一、Boss 专属机制

文件统一在 `assets/scripts/pve/core/bosses/`

### 第 1 章：哥布林酋长（GoblinChief.ts）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| HP | **500**（固定，绕过 bossChapterScaling，×10基准，原50） | `GOBLIN_CHIEF_HP` | GoblinChief.ts |
| 攻击 | `Math.round(30×1.5)=45`（×10基准，原5） | `MONSTER_BASE.BOSS.attack × bossChapterScaling(1)` | PveConstants.ts |
| 攻击范围（普通） | **3**（单目标，曼哈顿距离） | `GOBLIN_CHIEF_RANGE` | GoblinChief.ts |
| 狂暴阈值 | HP ≤ **200**（×10基准，原20） 时进入：攻击+10（×10基准，原+1）、移动+1 | `GOBLIN_CHIEF_ENRAGE_HP` | GoblinChief.ts |
| 蓄力重击间隔 | 每 **2** 个怪物回合（偶数回合） | `HEAVY_STRIKE_INTERVAL` | GoblinChief.ts |
| 重击 AOE 内圈半径 | **≤2**（曼哈顿距离） | `HEAVY_STRIKE_INNER_RANGE` | GoblinChief.ts |
| 重击 AOE 外圈半径 | **3-4**（曼哈顿距离） | `HEAVY_STRIKE_RANGE=4` | GoblinChief.ts |
| 重击内圈伤害倍率 | **×3** 基础攻击 | `HEAVY_STRIKE_MULTIPLIER` | GoblinChief.ts |
| 重击外圈伤害倍率 | **×2** 基础攻击 | `HEAVY_STRIKE_OUTER_MULTIPLIER` | GoblinChief.ts |
| 重击余波效果 | 被命中后移动AP+1持续 **2** 回合 | `HEAVY_AOE_SLOW_ROUNDS` | PveConstants.ts |
| 石块遮挡 | 石块在 boss→player 路径上时吸收伤害并消失 | `findBlockingRock()` | GoblinChief.ts |
| 蓄力预警机制 | 奇数回合（重击前1回合）发出 `HEAVY_STRIKE_WARNING` | `isHeavyStrikeWarningTurn()` | GoblinChief.ts |
| 重击实际伤害（内圈） | 45×3=**135**（无护甲，非狂暴，×10基准，原15） | — | — |
| 重击实际伤害（外圈） | 45×2=**90**（无护甲，非狂暴，×10基准，原10） | — | — |
| 增援号角 | 每 **2** 回合召唤弓箭手×2；狂暴时额外召唤战士×2 | `HORN_ARCHER_COUNT/HORN_WARRIOR_ENRAGE_COUNT` | PveConstants.ts |
| 增援间隔 | 与蓄力重击同步（偶数回合均触发） | `HORN_INTERVAL` | PveConstants.ts |
| Boss 房地形 | 随机生成 **2** 块石块障碍（第一章 Boss 层） | `CHAPTER1_BOSS_ROCK_COUNT` | PveConstants.ts |
| 掉落装备 | **50%** 概率哥布林酋长战斧（RARE WEAPON +30，×10基准，原+3） | `applyGoblinChiefDrop()` | LootSystem.ts |

**机制说明**：
- 攻击范围 3 使射手（射程最高 1+2+1=4）仍有一格安全距离，但不能无限放风筝
- 每 2 回合一次蓄力重击（范围 6），基本覆盖 10×10 Boss 层的大部分区域，迫使玩家主动接近
- HP≤200（×10基准，原20） 进入狂暴后每回合多走一步（MonsterAI stepBoss 处理），攻击提升，追击能力显著增强

### 第 2 章：沙虫女王（SandwormQueen.ts）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 潜地间隔 | 每 **4** 个怪物回合 | `SANDWORM_BURROW_INTERVAL` | PveConstants.ts |
| 潜地状态 | 免疫玩家攻击，冒出时双倍伤害 | `isBurrowed` 字段 | PveTypes.ts |

### 第 3 章：冰霜巨人（FrostGiant.ts）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 冰冻间隔 | 每 **4** 个怪物回合 | `FROST_GIANT_FREEZE_INTERVAL` | PveConstants.ts |
| 冰冻持续 | **1** 回合 | `FROST_GIANT_FREEZE_ROUNDS` | PveConstants.ts |
| 冰冻 AP 惩罚 | AP 上限 **-4**（最低保留 1） | `FROST_GIANT_AP_PENALTY` | PveConstants.ts |

### 第 4 章：熔岩领主（LavaLord.ts）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 灼烧 tick 数/次攻击 | **3** tick（每 tick=10 HP/回合，×10基准，原1HP） | `LAVA_LORD_BURN_TICKS` | PveConstants.ts |

### 第 5 章：命运守卫（FateGuardian.ts）

| 数值 | 当前值 | 变量 | 文件 |
|------|--------|------|------|
| 高 HP 时伤害翻倍阈值 | 玩家 HP > **50%** maxHp | `FATE_GUARDIAN_HP_THRESHOLD` | PveConstants.ts |
| 低 HP 时守卫闪避概率 | 玩家 HP ≤ 50% 时 **40%** 闪避 | `FATE_GUARDIAN_DODGE_CHANCE` | PveConstants.ts |

---

## 十二、命运碎片成长树（DestinyTreeSystem.ts，AC-20 局外永久成长）

5 列（A 生存 / B 战斗 / C 财富 / D 强化 / E 天命）× 3 节点，同列节点须按 order 1→2→3 顺序解锁，
解锁消耗 `destinyShards`（局外货币）。所有效果在 `startExpedition()` 时根据 `meta.unlockedTreeNodes`
一次性汇总为 `RunPlayer.treeBonuses` 快照（`getTreeBonuses()`），随存档持久化。

| 节点 | 名称 | 消耗 | 效果 | 变量 |
|------|------|------|------|------|
| A1 | 坚韧之躯Ⅰ | 15 | maxHp/hp **+20**（×10基准，原+2） | `TREE_A1_HP_BONUS` |
| A2 | 坚韧之躯Ⅱ | 25 | maxHp/hp 再 **+20**（与 A1 共计 +40，×10基准，原+2/共+4） | `TREE_A2_HP_BONUS` |
| A3 | 遗产意志 | 30 | 死亡结算保留 **20%** 当前金币（`INITIAL_GOLD + floor(gold×pct)`） | `TREE_A3_DEATH_GOLD_RETENTION` |
| B1 | 武者直觉 | 20 | 攻击力 **+3**（×10基准，原+0.3，原设计 +0.5 因 `Math.round` 导致 1→2 伤害翻倍而下调） | `TREE_B1_ATTACK_BONUS` |
| B2 | 急行军 | 25 | 每回合 AP 骰子上限 **+1**（dice∈[1,6] → 实际 AP +1） | `TREE_B2_AP_DICE_BONUS` |
| B3 | 职业先驱 | 30 | 远征开局随机一个可进阶职业（BERSERKER/ARCHER/ROGUE）碎片 **+1** | `TREE_B3_FRAGMENT_BONUS` |
| C1 | 财富眼光 | 15 | 开局金币 **+12**（原 +8 感知过弱上调） | `TREE_C1_GOLD_BONUS` |
| C2 | 宝箱老手 | 20 | 开宝箱金币额外 **+20%**（取整；原"金币下限+1"改为百分比加成） | `TREE_C2_CHEST_GOLD_BONUS_PCT` |
| C3 | 铁匠熟客 | 25 | 铁匠强化费用 **-5**（20→15，最低 1） | `TREE_C3_BLACKSMITH_DISCOUNT` |
| D1 | 灵感涌现 | 15 | 开局灵气 **+25** | `TREE_D1_ANIMA_BONUS` |
| D2 | 悟道加速 | 25 | 强化触发阈值整体 ×**0.9**（初始阈值 100→90，按 `Math.ceil` 计算） | `TREE_D2_THRESHOLD_MULT` |
| D3 | 灵脉共鸣 | 30 | 灵气获取额外 **+10%**（与饰品加成叠加后取整） | `TREE_D3_ANIMA_GAIN_PCT` |
| E1 | 誓石意志 | 20 | maxHp/hp **+40**（×10基准，原+4） | `TREE_E1_HP_BONUS` |
| E2 | 命运馈赠 | 30 | 远征开局触发一次「三选一」：随机 3 件不同槽位 COMMON 装备，选 1 件直接装备 | `hasEquipChoice` → `PendingTreeChoice(source:'E2')` |
| E3 | 命运护佑 | 40 | 远征开局触发一次「三选一」：从当前职业强化词条池中随机抽取最多 3 个，选 1 个直接获得 | `hasTraitChoice` → `PendingTreeChoice(source:'E3')` |

**E2/E3 三选一机制**：与既有 `ANIMA_STRENGTHEN` 三选一模式一致，由 `buildPendingTreeChoices()` 在
`startExpedition()` 时生成 `pendingTreeChoices` 队列（先 E2 后 E3），玩家通过
`resolveTreeChoice(state, index)` 逐个选定；E2 选定的装备直接装入对应槽位（覆盖原装备），
E3 选定的词条加入 `classTraits`（重复词条去重 no-op）。

---

---

*数值调整时只需修改对应变量，本文档同步更新。*
