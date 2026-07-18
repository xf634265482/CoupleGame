# Camp Profession Stats Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在营地角色区每张已解锁职业卡上，预览「该职业 + 当前营地装备」的攻击/最大生命/护甲/射程。

**Architecture:** 在 `core/` 新增纯逻辑 `previewCampCombatStats`：把 profile 装载转成临时 `RunPlayer`，复用 `playerAttackPower` / `playerArmorPower`；`CampView._renderProfession` 读该结果画一行文案。不读局内残血与临时状态。

**Tech Stack:** Cocos Creator 3.8 TS（UI）、ts-jest（`test/pve/`）、现有 `ProfessionBaseStats` / `CombatSystem` / `EquipmentProgression`。

## Global Constraints

- 展示字段固定：攻击、最大生命、护甲、射程；生命用最大生命。
- 口径：营地配置预览；`playerAttackPower(player)` 不传 chapter（当前实现忽略 balance/chapter，钉死默认调用）。
- 命痕：不额外发明面板加成；仅走与开战相同的装备装载路径。
- PVE `core/` 禁止 `import 'cc'`、禁止直接 `Math.random()`。
- 玩法展示规则变更须同步 `specs/260608-pve-destiny-expedition/design.md`。
- 不改云端 `updateCampConfiguration` 协议。

## File Structure

| File | Role |
|------|------|
| Create `assets/scripts/pve/core/CampCombatPreview.ts` | `loadoutToRunEquipment` + `classIdFromProfessionId` + `previewCampCombatStats` |
| Create `test/pve/CampCombatPreview.test.ts` | 空装三职业、换装变化、同装职业差 |
| Modify `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts` | 改用共享 `loadoutToRunEquipment` / `classIdFromProfessionId` |
| Modify `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts` | 同上 |
| Modify `assets/scripts/pve/tutorial/TutorialFloorFactory.ts` | 同上 |
| Modify `assets/scripts/pve/views/CampView.ts` | 角色卡渲染属性行 |
| Modify `specs/260608-pve-destiny-expedition/design.md` | 营地角色区规则 |
| Modify `CALL_FLOW.md` | 营地渲染补一句 |

---

### Task 1: `previewCampCombatStats` helper + unit tests

**Files:**
- Create: `assets/scripts/pve/core/CampCombatPreview.ts`
- Create: `test/pve/CampCombatPreview.test.ts`
- Modify: `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts`（删除本地 `toRunEquipment` / `classIdOf`，改 import）
- Modify: `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts`（同上）
- Modify: `assets/scripts/pve/tutorial/TutorialFloorFactory.ts`（同上）

**Interfaces:**
- Consumes: `PveProfile`, `PveProfessionId`, `professionBaseStats`, `equipmentMaxHpBonus`, `toFixedEquipItem`, `playerAttackPower`, `playerArmorPower`, `RunPlayer`, `Equipment`, `ClassId`
- Produces:
  - `export interface CampCombatStatsPreview { attack: number; maxHp: number; armor: number; range: number }`
  - `export function classIdFromProfessionId(professionId: PveProfessionId): ClassId`
  - `export function loadoutToRunEquipment(profile: PveProfile): Equipment`
  - `export function previewCampCombatStats(profile: PveProfile, professionId: PveProfessionId): CampCombatStatsPreview`

- [ ] **Step 1: Write the failing test**

Create `test/pve/CampCombatPreview.test.ts`:

```ts
import { previewCampCombatStats } from '../../assets/scripts/pve/core/CampCombatPreview';
import { PROFESSION_BASE_STATS } from '../../assets/scripts/pve/core/professions/ProfessionBaseStats';
import type { PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(overrides: Partial<PveProfile> = {}): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    highestClearedAt: null,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    stamina: 60,
    staminaUpdatedAt: 1,
    staminaNextRecoveryAt: null,
    tutorialFreeChallengeConsumed: false,
    updatedAt: 1,
    ...overrides,
  };
}

describe('previewCampCombatStats', () => {
  test('empty loadout matches profession base panel for all three jobs', () => {
    const p = profile();
    for (const id of ['WARRIOR', 'ARCHER', 'RANGER'] as const) {
      const base = PROFESSION_BASE_STATS[id];
      const stats = previewCampCombatStats(p, id);
      expect(stats.maxHp).toBe(base.maxHp);
      expect(stats.armor).toBe(0);
      expect(stats.range).toBe(base.attackRange);
      expect(stats.attack).toBe(Math.max(10, Math.round(base.attack)));
    }
  });

  test('same loadout: archer range is higher than warrior', () => {
    const p = profile();
    const warrior = previewCampCombatStats(p, 'WARRIOR');
    const archer = previewCampCombatStats(p, 'ARCHER');
    expect(archer.range).toBeGreaterThan(warrior.range);
    expect(warrior.maxHp).toBeGreaterThan(archer.maxHp);
  });

  test('equipping armor and helmet raises armor and maxHp', () => {
    const p = profile({
      equipmentInventory: [
        { instanceId: 'a1', definitionId: '皮革轻甲', quality: 'COMMON', enhanceLevel: 0, locked: false },
        { instanceId: 'h1', definitionId: '皮革头盔', quality: 'COMMON', enhanceLevel: 0, locked: false },
      ],
      equipmentLoadout: { ARMOR: 'a1', HELMET: 'h1' },
    });
    const empty = previewCampCombatStats(profile(), 'WARRIOR');
    const geared = previewCampCombatStats(p, 'WARRIOR');
    expect(geared.maxHp).toBeGreaterThan(empty.maxHp);
    expect(geared.armor).toBeGreaterThan(empty.armor);
  });

  test('equipping a weapon raises attack', () => {
    const p = profile({
      equipmentInventory: [
        { instanceId: 'w1', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false },
      ],
      equipmentLoadout: { WEAPON: 'w1' },
    });
    const empty = previewCampCombatStats(profile(), 'WARRIOR');
    const geared = previewCampCombatStats(p, 'WARRIOR');
    expect(geared.attack).toBeGreaterThan(empty.attack);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/pve/CampCombatPreview.test.ts --no-cache`

Expected: FAIL — cannot find module `CampCombatPreview`（或类似）。

- [ ] **Step 3: Write minimal implementation**

Create `assets/scripts/pve/core/CampCombatPreview.ts`:

```ts
import { playerArmorPower, playerAttackPower } from './CombatSystem';
import { equipmentMaxHpBonus, toFixedEquipItem } from './equipment/EquipmentProgression';
import type { ClassId } from './PveConstants';
import type { PveProfessionId, PveProfile } from './PveProgressionTypes';
import type { Equipment, RunPlayer } from './PveTypes';
import { professionBaseStats } from './professions/ProfessionBaseStats';

export interface CampCombatStatsPreview {
  attack: number;
  maxHp: number;
  armor: number;
  range: number;
}

export function classIdFromProfessionId(professionId: PveProfessionId): ClassId {
  if (professionId === 'ARCHER') return 'ARCHER';
  if (professionId === 'RANGER') return 'ROGUE';
  return 'BERSERKER';
}

export function loadoutToRunEquipment(profile: PveProfile): Equipment {
  const equipment: Equipment = {};
  for (const slot of ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const) {
    const instanceId = profile.equipmentLoadout[slot];
    if (!instanceId) continue;
    const instance = profile.equipmentInventory.find((item) => item.instanceId === instanceId);
    if (!instance) continue;
    equipment[slot] = toFixedEquipItem(instance);
  }
  return equipment;
}

export function previewCampCombatStats(
  profile: PveProfile,
  professionId: PveProfessionId,
): CampCombatStatsPreview {
  const equipment = loadoutToRunEquipment(profile);
  const base = professionBaseStats(professionId);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  const player: RunPlayer = {
    hp: maxHp,
    maxHp,
    gold: 0,
    anima: 0,
    animaProgress: 0,
    animaThreshold: 100,
    classId: classIdFromProfessionId(professionId),
    equipment,
    bag: [],
    campMaxHpBuys: 0,
  };
  // 钉死：不传 chapter/balance；与当前 CombatSystem 面板公式一致（二者未参与计算）。
  const { damage, range } = playerAttackPower(player);
  const { armor } = playerArmorPower(player);
  return { attack: damage, maxHp, armor, range };
}
```

In `Chapter1ExpeditionFactory.ts` / `Chapter2ExpeditionFactory.ts` / `TutorialFloorFactory.ts`:

- Remove local `classIdOf` / `toRunEquipment` / `loadedInstance` if only used for equipment.
- Import `{ classIdFromProfessionId, loadoutToRunEquipment } from '../CampCombatPreview'`（tutorial 路径按相对层级调整）。
- `createPlayer` 内：`const equipment = loadoutToRunEquipment(profile);` 与 `classId: classIdFromProfessionId(...)`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/pve/CampCombatPreview.test.ts --no-cache`

Expected: PASS（全部绿）。

Also smoke factories still green:

Run: `npx jest test/pve/Chapter1ExpeditionFactory.test.ts test/pve/TutorialFloorBoot.test.ts --no-cache`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/CampCombatPreview.ts test/pve/CampCombatPreview.test.ts \
  assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts \
  assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts \
  assets/scripts/pve/tutorial/TutorialFloorFactory.ts
git commit -m "feat(pve): add camp combat stats preview helper"
```

---

### Task 2: CampView 角色区属性行

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts`（`_renderProfession` 约 308–339 行）

**Interfaces:**
- Consumes: `previewCampCombatStats(profile, id): CampCombatStatsPreview`
- Produces: 已解锁职业卡上的属性 Label（无新对外 API）

- [ ] **Step 1: Wire stats line into `_renderProfession`**

In `CampView.ts` add import:

```ts
import { previewCampCombatStats } from '../core/CampCombatPreview';
```

Update `_renderProfession` so unlocked cards:

1. Slightly increase card height (e.g. content size height `145` → `168`，`roundRect`/`y` 步进同步，约 `y -= 190`）。
2. After the experience `detail` label，before `techniques`，insert:

```ts
const stats = previewCampCombatStats(profile, id);
const statsLabel = makeLabel(block, 0, -36, 490, 26, 18,
  id === profile.selectedProfessionId ? new Color(255, 214, 110) : TEXT,
  Label.HorizontalAlign.LEFT);
statsLabel.string = `攻击 ${stats.attack} · 生命 ${stats.maxHp} · 护甲 ${stats.armor} · 射程 ${stats.range}`;
```

3. Move `techniques` down (e.g. from `-52` to `-62`）and switch button if needed so nothing overlaps.
4. Unlocked-only：属性行放在 `if (mastery.unlocked) { ... }` 内；未解锁不加。

Exact positions may need a 1-pass visual tweak in editor preview; keep one stats line, no second panel.

- [ ] **Step 2: Manual sanity (or editor preview)**

Open camp → 角色区：

- 三张已解锁卡都有四项数字。
- 当前职业属性行为金色（或与选中描边一致的强调色）。
- 装备台换装后回角色区数字变化（现有 `CampController` 保存后已会 `refresh`/`render`，无需新回调）。

No new automated UI test required（项目无 CampView 截图测试）。

- [ ] **Step 3: Commit**

```bash
git add assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): show combat stats on camp profession cards"
```

---

### Task 3: Docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `CALL_FLOW.md`

**Interfaces:**
- Consumes: 无代码接口
- Produces: 文档与实现一致

- [ ] **Step 1: Update design.md**

Near the camp / profession section（“职业切换…只通过营地…”附近，约 § 早期营地条款），add:

```markdown
- **营地角色区属性预览**：每张已解锁职业卡展示「该职业 + 当前营地装备配置」的攻击、最大生命、护甲、射程；口径为营地配置预览（最大生命，不含局内残血/临时状态）。切换职业或换装保存后即时刷新；用于对比调配，不改变开战快照规则（进行中的挑战仍用开局快照）。
```

- [ ] **Step 2: Update CALL_FLOW.md**

In section「2. 进入营地」渲染行改为：

```text
  -> CampView 渲染：命痕台 / 装备台 / 远征情报 / 角色区
     （角色区：已解锁职业卡调用 previewCampCombatStats 显示攻击/生命/护甲/射程预览）
```

- [ ] **Step 3: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md CALL_FLOW.md
git commit -m "docs: sync camp profession stats preview rules"
```

---

## Spec Coverage Self-Check

| Spec requirement | Task |
|------------------|------|
| 四项字段 | Task 1 + 2 |
| 每张已解锁卡预览 | Task 2 |
| 营地配置口径 / 最大生命 | Task 1 |
| 换装/换职后刷新 | Task 2（既有 refresh） |
| 未解锁无属性 | Task 2 |
| 不读楼层实况 | Task 1 |
| design.md + CALL_FLOW | Task 3 |
| 单测空装/换装/职业差 | Task 1 |
| 与开战装载一致 | Task 1 抽出共享 loadout |

## Placeholder / Type Check

- 无 TBD；`CampCombatStatsPreview` 字段名在 Task 1/2 一致。
- `playerAttackPower(player)` 钉死不传 chapter。
- Factory 重构与 helper 同 Task 1，避免双份 `toRunEquipment`。
