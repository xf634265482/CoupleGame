# M2 系统深度补全 — Design

> 范围：把当前所有"已设计未生效"的系统词条接通战斗/移动计算，让 EPIC+ 装备词条与灵气强化真正影响数值。
> 关联：[经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md)、[战斗系统V1](../game-design/战斗系统V1.md)、[数值系统V1](../game-design/数值系统V1.md)。
> 决定日期：2026-06-13。前置：260613-chapter25-content-depth（HELMET 已通了 helper 路径，本批装备词条可复用 `equipItem`）。

## 目标

两件事：

1. **装备词条 atk/def/hp 三条接入战斗**：消除 `EQUIP_TRAIT_POOL` 中"M2 占位（仅展示）"的尴尬——洗炼了等于没洗炼。
2. **完整 15 词条灵气强化池**：把 M1 占位的"按职业 4-5 词条通用数值池"扩到 design.md AC-16 承诺的"每职业 15 词条 + 含堆叠/条件触发"。

## 一、装备词条接入

### 1.1 现状

| id | 描述 | 状态 |
|---|---|---|
| `equip_atk_up` | 攻击 +1 | M2 占位（仅展示） |
| `equip_def_up` | 防御 +1 | M2 占位（仅展示） |
| `equip_hp_up` | 最大 HP +2 | M2 占位（仅展示） |
| `equip_crit_up` | 暴击率 +5% | M2 已实现 |
| `equip_gold_up` | 拾取金币 +10% | M2 已实现 |
| `equip_swift` | 移动消耗 -1 AP | M2 已实现 |

### 1.2 方案

新增统一 helper：`assets/scripts/pve/core/EquipTraitEffects.ts`：

```ts
export function equipTraitAtkBonus(player: RunPlayer): number   // 遍历装备 trait, 累计 atk_up 加成
export function equipTraitDefBonus(player: RunPlayer): number
export function equipTraitHpBonus(player: RunPlayer): number
```

接入点：
- `CombatSystem.playerAttackPower` → 末尾 `+ equipTraitAtkBonus(player)`
- `CombatSystem.monsterAttack` 伤害结算 → 现有 `armorReduction` 后再扣 `equipTraitDefBonus(player)`
- `EquipHelper.equipItem` →（装备替换时）`maxHp += equipTraitHpBonus(new) - equipTraitHpBonus(old)`（与 HELMET baseStat 同时机处理）

### 1.3 数值

- `equip_atk_up`：+1 攻击（直接加，不缩放章节）
- `equip_def_up`：+1 减伤（在护甲后再扣）
- `equip_hp_up`：+2 maxHp，hp 不主动补（与 HELMET 一致）

只有 EPIC/LEGENDARY 装备有词条槽，所以全身最多 5 件 × 1 词条 = 5 个加成栏位；最多堆 5 倍。

## 二、完整 15 词条灵气强化池

### 2.1 现状

| 职业 | 现有词条数 | 缺口 |
|---|---|---|
| ADVENTURER | 4 | M1 占位通用池，不扩 |
| BERSERKER | 5 | -10 |
| ARCHER | 5 | -10 |
| ROGUE | 5 | -10 |

### 2.2 设计原则

每职业 15 词条分三类：

- **基础数值类（5 词条）**：直接加属性，无条件触发，无堆叠门槛
- **条件触发类（5 词条）**：有触发条件（HP%、距离、状态等），命中时给较高收益
- **堆叠/进阶类（5 词条）**：允许同名重复选择（每层 +1 效果），或与其他词条组合时增益

### 2.3 BERSERKER 完整 15 词条

| 类别 | id | 效果 | 备注 |
|---|---|---|---|
| 基础 | `life_steal` | 攻击回 1 HP | 已有 |
| 基础 | `berserk` | HP≤50% 时攻击+1 | 已有 |
| 基础 | `blood_rage` | 击杀回 2 HP | 已有 |
| 基础 | `undying` | 本层首次将死时保留 1 HP | 已有 |
| 基础 | `counter` | 受击时对攻击者造成 1 伤 | 已有 |
| 条件 | `last_stand` | HP≤25% 时攻击翻倍 |  |
| 条件 | `vengeance` | 受击后 1 回合内攻击+2 |  |
| 条件 | `cleave` | 攻击同时对相邻 1 格敌人造成 50% 伤 |  |
| 条件 | `pain_tolerance` | 受到 ≥5 伤时减 2 |  |
| 条件 | `executioner` | 对 HP≤20% 敌人 +3 伤 |  |
| 堆叠 | `iron_skin_stack` | maxHp +3，可堆 3 次 |  |
| 堆叠 | `bloodlust_stack` | 击杀回 1 HP，可堆 5 次（与 blood_rage 叠加） |  |
| 堆叠 | `rage_strike_stack` | 攻击 +0.5，可堆 5 次 |  |
| 进阶 | `berserker_resolve` | 已选 ≥3 个 berserker 词条时，HP≤30% 攻击 ×1.5 |  |
| 进阶 | `final_charge` | 单层首次低血时 AP+3 | 一次性 |

### 2.4 ARCHER 完整 15 词条

| 类别 | id | 效果 |
|---|---|---|
| 基础 | `eagle_eye` | 攻击范围+1（已有） |
| 基础 | `marksman` | 攻击+0.5（已有） |
| 基础 | `multi_shot` | 30% 概率再射一箭（已有） |
| 基础 | `pierce` | 无视护甲（已有） |
| 基础 | `crit` | 20% 概率三倍伤（已有） |
| 条件 | `point_blank` | 相邻敌人 +2 伤 |
| 条件 | `long_shot` | 距离≥3 时 +2 伤 |
| 条件 | `first_strike` | 本回合首次攻击 +50% |
| 条件 | `headshot` | HP 满时暴击率 +20% |
| 条件 | `volley` | 攻击范围内有 ≥2 敌人时全部命中（30% 伤害） |
| 堆叠 | `keen_eye_stack` | 范围+1，可堆 2 次 |
| 堆叠 | `steady_aim_stack` | 暴击+5%，可堆 5 次 |
| 堆叠 | `arrow_storm_stack` | multi_shot 概率+10%，可堆 3 次 |
| 进阶 | `archers_focus` | 已选 ≥3 个 archer 词条时，crit 升至 30% 五倍 |
| 进阶 | `quiver_overflow` | 本层每 3 回合自动免费攻击 1 次 |

### 2.5 ROGUE 完整 15 词条

| 类别 | id | 效果 |
|---|---|---|
| 基础 | `swift` | 移动 -1 AP（已有） |
| 基础 | `backstab` | 移动后首次攻击 ×2（已有） |
| 基础 | `stealth` | 怪物仇恨范围 -2（已有） |
| 基础 | `afterimage` | 本层闪避首次受击（已有） |
| 基础 | `assassin_heart` | 对非追击敌人 +2 伤（已有） |
| 条件 | `flanking` | 攻击非面向自己的敌人 +2 伤 |
| 条件 | `silent_step` | 移动后该回合 stealth +1 |
| 条件 | `evasion` | HP≤50% 闪避率 +30% |
| 条件 | `shadow_strike` | 在迷雾中攻击 +2 伤 |
| 条件 | `poison_blade` | 攻击附加 2 回合 1 伤 DOT |
| 堆叠 | `quick_step_stack` | 移动 -0.5 AP（向下取整），可堆 2 次 |
| 堆叠 | `dagger_master_stack` | 攻击 +0.5，可堆 5 次 |
| 堆叠 | `shadow_cloak_stack` | 仇恨-1，可堆 3 次 |
| 进阶 | `rogue_mastery` | 已选 ≥3 个 rogue 词条时，backstab 升至 ×3 |
| 进阶 | `vanish` | 本层一次性：使用后下回合所有怪物失去追击 |

### 2.6 堆叠机制

在 `AnimaSystem.applyStrengthen` 现有"已拥有则 no-op"逻辑基础上：
- 词条 id 以 `_stack` 结尾的允许多次选择
- 在 `player.classTraits` 中记录次数（用 `string[]` 而非 `Set`，重复 id 累计）
- `CombatSystem`/`MovementSystem` 计算时统计该 id 出现次数 × 单次效果

### 2.7 候选池过滤

`AnimaSystem.rollChoices` 抽 3 选 1 时：
- 已拥有非 stack 词条 → 池中过滤掉
- 已拥有 stack 词条达到上限 → 池中过滤掉
- 进阶词条 → 需先满足"已选 ≥3 个该职业基础/条件词条"才进池
- 一次性词条（last_stand 不算，仅 `final_charge`/`vanish`/`quiver_overflow` 这类标记 `oneShot:true`）→ 已使用过则不再进池

## 三、验收

- AC-401：装备 EPIC 武器带 `equip_atk_up` 词条，`playerAttackPower` 输出值含 +1
- AC-402：装备 EPIC 护甲带 `equip_def_up` 词条，怪物伤害扣减后再 -1
- AC-403：装备 EPIC 头盔带 `equip_hp_up` 词条，maxHp +2
- AC-404：BERSERKER/ARCHER/ROGUE 各 15 词条 ts-jest 单测覆盖触发条件
- AC-405：堆叠词条选 3 次后池中消失（达上限）
- AC-406：进阶词条未满足条件时不出现在候选池
- AC-407：跨端确定性保持（同 seed 同选择序列 → 同结果）

## 四、不在本批范围

- 词条本地化/UI 文案润色（独立批次）
- 命运树 E3「命运护佑」复用新词条池的兼容性（已 `strengthenPoolForClass` 兼容，本批顺带验证即可）
