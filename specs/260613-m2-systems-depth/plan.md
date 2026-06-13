# M2 系统深度补全 — Implementation Plan

> 配套 [design.md](design.md)。前置：260613-chapter25-content-depth 已落地（`equipItem` helper 可复用）。

## 阶段 1：装备词条三条接入战斗（2 小时）

### T1.1 新建 EquipTraitEffects.ts
- `assets/scripts/pve/core/EquipTraitEffects.ts`：
  ```ts
  export function equipTraitAtkBonus(player: RunPlayer): number
  export function equipTraitDefBonus(player: RunPlayer): number
  export function equipTraitHpBonus(equipment: RunPlayer['equipment']): number
  ```
- 遍历 5 装备槽位，统计带 `equip_atk_up`/`equip_def_up`/`equip_hp_up` trait 的件数 × 单次加成（1/1/2）

### T1.2 接入 CombatSystem
- `playerAttackPower`：末尾 `+ equipTraitAtkBonus(player)`
- `monsterAttack` 伤害计算：`armorReduction` 之后再扣 `equipTraitDefBonus(player)`，最低 0

### T1.3 接入 EquipHelper.equipItem
- 装备/替换/强化任意槽位时，重算 `equipTraitHpBonus`，差值加到 maxHp（与 HELMET baseStat 同时机）

### T1.4 测试
- 新建 `test/pve/equip-traits.test.ts`：
  - atk_up 加成生效
  - def_up 加成生效（含护甲后再扣）
  - hp_up 加成在装备替换时正确调整 maxHp
  - 多件叠加（如 atk_up×3）

### T1.5 同步文档
- [经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §2.3 表格更新三行状态为 "已实现"
- §七已知限制移除"三条仅 UI 展示"那条

---

## 阶段 2：灵气强化词条池扩到 15（核心，~半天）

### T2.1 数据扩展
- `AnimaSystem.ts`：将 `BERSERKER_STRENGTHEN_POOL`/`ARCHER_STRENGTHEN_POOL`/`ROGUE_STRENGTHEN_POOL` 各扩到 15 词条
- 新增 metadata：`STRENGTHEN_META: Record<string, { stack?: number; oneShot?: true; tier: 'basic'|'condition'|'stack'|'advanced'; classId: ClassId }>`
  - `stack` 字段表示允许堆叠次数（缺省 1=不可堆叠）
  - `tier` 用于 `advanced` 词条的解锁判定

### T2.2 改造 rollChoices 过滤逻辑
- `AnimaSystem.rollChoices`：传入 `player.classTraits` 副本，按以下规则过滤池：
  ```
  for each candidate in pool:
    meta = STRENGTHEN_META[candidate]
    if meta.oneShot and player.classTraits.includes(candidate): skip
    if meta.stack==1 and player.classTraits.includes(candidate): skip
    if meta.stack>1 and count(player.classTraits, candidate) >= meta.stack: skip
    if meta.tier=='advanced' and countBaseAndConditionInClass(player) < 3: skip
  ```
- 过滤后再 `rng.shuffle` 取前 3

### T2.3 改造 applyStrengthen
- 现有"已包含 → no-op"逻辑改为"按 meta.stack 判定"
- HP 立即生效逻辑保留并扩展：`strengthen_hp_up` / `iron_skin_stack` / `equip_hp_up` 都触发 maxHp+hp 同步

### T2.4 接入新词条到 CombatSystem / MovementSystem
**逐词条接入**，每词条一个 commit，可单测：

- BERSERKER 新增 10 个：
  - `last_stand`：playerAttackPower 内判 HP≤25% → ×2
  - `vengeance`：endTurn 在 floorState 上记 `vengeanceRounds`；monsterAttack 末尾置 1
  - `cleave`：playerAttack 命中后对相邻 1 格敌人扣 attack×0.5
  - `pain_tolerance`：monsterAttack 伤害 ≥5 时 -2
  - `executioner`：playerAttack 对 HP≤20% 目标 +3 伤
  - `iron_skin_stack`：装备/强化时统计次数 × 3 加 maxHp
  - `bloodlust_stack`：每次击杀回 +stackCount HP
  - `rage_strike_stack`：playerAttackPower +stackCount × 0.5
  - `berserker_resolve`：满足条件时 HP≤30% 攻击 ×1.5
  - `final_charge`：oneShot，首次低血时触发 AP+3 + 标记已用

- ARCHER 新增 10 个（类似分布）
- ROGUE 新增 10 个（类似分布）

### T2.5 测试
- `test/pve/strengthen-pool-v2.test.ts`：
  - 每职业 15 词条逐条触发测试
  - 池过滤：stack 满后不出现、advanced 未解锁不出现、oneShot 用过不出现
  - 跨端确定性：同 seed + 同选择序列 = 同结果（AC-13/AC-407）

### T2.6 同步文档
- [经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §3.2 词条池表全面更新到 15 词条 × 3 职业
- §3.3 应用强化补充"堆叠 / 解锁条件 / oneShot"机制说明
- §七.3 已知限制移除"M1 占位"那条

---

## 阶段 3：验收（30 分钟）

- [ ] `npm test` / `npm run test:pve` 全绿
- [ ] 手动跑 BERSERKER/ARCHER/ROGUE 各一局到 anima_threshold 触发，肉眼检查 3 选 1 候选合理
- [ ] AC-13 跨端确定性回归
- [ ] 命运树 E3「命运护佑」复用新词条池验证（`strengthenPoolForClass` 调用点 grep 确认）

---

## 工作量估算

| 阶段 | 时间 |
|---|---|
| 阶段 1 装备词条接入 | 2 小时 |
| 阶段 2 词条池扩到 15 | 4 小时 |
| 阶段 3 验收 | 30 分钟 |
| **合计** | **~6.5 小时**（约 1 工作日） |
