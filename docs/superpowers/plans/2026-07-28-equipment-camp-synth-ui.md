# Equipment Camp Synth Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minghen-style explicit synthesize panel to the camp Equipment tab (1 result + 3 materials, whole-page scroll, 投入合成), using existing 3-to-1 quality SYNTHESIZE rules.

**Architecture:** Mirror `CampMinghenLayout` / minghen synth UI patterns. Local `_equipSynthSlots: [string|null, string|null, string|null]` on `CampView`. Controller calls `manageCamp({ type:'EQUIPMENT', action:'SYNTHESIZE', instanceIds })` with the three slotted ids (no `pickSynthesizeMaterials`). Cloud formula unchanged.

**Tech Stack:** Cocos Creator 3.8.8 TS, Jest `test/pve`, existing `PveCamp` SYNTHESIZE.

**Spec:** `docs/superpowers/specs/2026-07-28-equipment-camp-synth-ui-design.md`

## Global Constraints

- Do not change SYNTH_STARDUST, quality chain, or cloud `synthesizeEquipment` formula.
- Materials: 3 distinct instanceIds, same definitionId + quality, unlocked, unequipped.
- Remove one-click 合成 from unequipped equipment detail; use 投入合成 + panel button only.
- Equipped detail keeps 强化 / 锁定 / 出售 / 卸下 only.
- Prefer patterns from `CampView._renderMinghen` / `_renderMinghenSynth`.
- No new enum; `as const` / string unions.

## File map

| File | Responsibility |
|---|---|
| `assets/scripts/pve/views/CampEquipmentLayout.ts` | Viewport, bag metrics, synth 1+3 geometry |
| `test/pve/CampEquipmentLayout.test.ts` | Geometry non-overlap |
| `assets/scripts/pve/views/CampView.ts` | Scroll equipment page, synth UI, put/clear slots |
| `assets/scripts/pve/controllers/CampController.ts` | `onSynthesizeEquipmentFromSlots(ids)` |
| `specs/260608-pve-destiny-expedition/design.md` | Note explicit camp synth UI |

---

### Task 1: Equipment layout constants + geometry test

**Files:**
- Create: `assets/scripts/pve/views/CampEquipmentLayout.ts`
- Create: `test/pve/CampEquipmentLayout.test.ts`

**Interfaces:**
- Produces: `CAMP_EQUIPMENT_LAYOUT`, `equipmentContentMetrics(bagCount)`, slot helpers

- [ ] **Step 1: Write failing layout test**

```ts
import {
  CAMP_EQUIPMENT_LAYOUT,
  equipmentContentMetrics,
  intersects,
} from '../../assets/scripts/pve/views/CampEquipmentLayout';

test('equipment synth sits below bag and uses three input slots', () => {
  const m = equipmentContentMetrics(8);
  expect(CAMP_EQUIPMENT_LAYOUT.synthInputCount).toBe(3);
  expect(m.bagTitleY).toBeGreaterThan(m.synthTitleY);
  expect(m.synthResultY).toBeGreaterThan(m.synthInputY);
  expect(m.synthInputY).toBeGreaterThan(m.synthButtonY);
  expect(m.contentHeight).toBeGreaterThanOrEqual(CAMP_EQUIPMENT_LAYOUT.viewportHeight);
  const slots = CAMP_EQUIPMENT_LAYOUT.synthInputXs.map((x) => ({
    left: x - CAMP_EQUIPMENT_LAYOUT.synthSlotWidth / 2,
    right: x + CAMP_EQUIPMENT_LAYOUT.synthSlotWidth / 2,
    top: m.synthInputY + CAMP_EQUIPMENT_LAYOUT.synthSlotHeight / 2,
    bottom: m.synthInputY - CAMP_EQUIPMENT_LAYOUT.synthSlotHeight / 2,
    centerY: m.synthInputY,
  }));
  expect(intersects(slots[0]!, slots[1]!)).toBe(false);
  expect(intersects(slots[1]!, slots[2]!)).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm run test:pve -- --testPathPattern=CampEquipmentLayout`)

- [ ] **Step 3: Implement `CampEquipmentLayout.ts`**

Suggested constants (tune ±4px if needed):

```ts
export const CAMP_EQUIPMENT_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 620,
  summaryY: 250,
  loadoutTitleY: 210,
  loadoutSlotSize: 88,
  loadoutSlotGap: 18,
  loadoutY: 120,
  bagTitleY: 30, // overridden by metrics when bag grows — or compute in metrics only
  bagCols: 5,
  bagSize: 96,
  bagGap: 10,
  synthSlotWidth: 100,
  synthSlotHeight: 56,
  synthInputCount: 3,
  synthInputXs: [-130, 0, 130] as const,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 40,
} as const;

export function bagRows(count: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count) / CAMP_EQUIPMENT_LAYOUT.bagCols));
}

export function equipmentContentMetrics(bagCount: number): {
  contentHeight: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_EQUIPMENT_LAYOUT;
  const loadoutBottom = L.loadoutY - L.loadoutSlotSize / 2 - 24;
  const bagTitleY = loadoutBottom - 20;
  const bagFirstRowY = bagTitleY - 50;
  const bagBottom = bagFirstRowY - bagRows(bagCount) * (L.bagSize + L.bagGap);
  const synthTitleY = bagBottom - 36;
  const synthResultY = synthTitleY - 50;
  const synthInputY = synthResultY - 90;
  const synthButtonY = synthInputY - 70;
  const top = L.summaryY + 40;
  const bottom = synthButtonY - L.contentBottomPadding;
  return {
    contentHeight: Math.max(L.viewportHeight, top - bottom + 20),
    bagTitleY,
    bagFirstRowY,
    synthTitleY,
    synthResultY,
    synthInputY,
    synthButtonY,
  };
}

// copy intersects/rectBounds from CampMinghenLayout or import shared if already exported
```

- [ ] **Step 4: Tests PASS; commit**

```bash
git add assets/scripts/pve/views/CampEquipmentLayout.ts test/pve/CampEquipmentLayout.test.ts
git commit -m "feat(pve): add camp equipment synth layout metrics"
```

---

### Task 2: CampView equipment scroll + synth UI

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts`
- Modify: `assets/scripts/pve/controllers/CampController.ts` (callback stub type only if needed)

**Interfaces:**
- Consumes: `CAMP_EQUIPMENT_LAYOUT`, `equipmentContentMetrics`, `nextEquipQuality`, `SYNTH_STARDUST`, `QUALITY_NAMES`
- Produces:
  - `_equipSynthSlots: [string | null, string | null, string | null]`
  - `clearEquipmentSynthSlots(): void`
  - Callback: `onSynthesizeEquipmentSlots(instanceIds: [string, string, string]): void`
  - Remove `onSynthesizeEquipment(primaryInstanceId)` from detail path (keep controller method renamed)

- [ ] **Step 1: Extend callbacks**

```ts
onSynthesizeEquipmentSlots(instanceIds: [string, string, string]): void;
// remove usage of onSynthesizeEquipment from detail; can delete from interface after controller update
```

- [ ] **Step 2: Rewrite `_renderEquipment` like `_renderMinghen`**

1. Build ScrollView viewport 570×620.
2. Content height from `equipmentContentMetrics(bagItems.length)`.
3. Draw summary, loadout slots, bag icon grid into **content** (reuse `_equipSquareSlot` / `_bagIconCard` with `parent` = content; adjust `_bagIconCard` to accept parent + rowBaseY via existing index math like `_gridCard`).
4. Call `_renderEquipmentSynth(content, profile, metrics, iconRevision)`.

- [ ] **Step 3: Implement `_renderEquipmentSynth`**

- Title `装备合成`.
- Graphics lines from each of 3 input centers to result center.
- Result preview:
  - If 3 ids filled and same def+quality and `nextEquipQuality` and gold >= cost → `名称 · 下一品质 · N星尘`
  - Else if 3 filled but legendary → `满品不可合成`
  - Else if any filled → `需同名同品质×3`
  - Else `结果`
- Input slots show icon (reuse attach) or short name; click clears that slot index.
- 合成 button `interactable` only when preview legal.

- [ ] **Step 4: Put / canPut helpers**

```ts
private _canPutEquipmentIntoSynth(item: PveEquipmentInstance): boolean {
  if (!this._profile) return false;
  if (item.locked) return false;
  const equipped = new Set(Object.values(this._profile.equipmentLoadout).filter(Boolean));
  if (equipped.has(item.instanceId)) return false;
  if (this._equipSynthSlots.includes(item.instanceId)) return false;
  if (this._equipSynthSlots.every(Boolean)) return false;
  const filled = this._equipSynthSlots.filter(Boolean) as string[];
  if (filled.length === 0) return !!nextEquipQuality(item.quality);
  const anchor = this._profile.equipmentInventory.find((x) => x.instanceId === filled[0]);
  if (!anchor) return false;
  return anchor.definitionId === item.definitionId
    && anchor.quality === item.quality
    && !!nextEquipQuality(item.quality);
}

private _putEquipmentIntoSynth(instanceId: string): void { /* fill first null; re-render EQUIPMENT */ }
```

- [ ] **Step 5: Update `_showEquipmentDetail`**

Unequipped actions:

```ts
[
  { text: '装备', ... },
  { text: '投入合成', disabled: !this._canPutEquipmentIntoSynth(item), action: () => this._putEquipmentIntoSynth(item.instanceId) },
  { text: lock..., ... },
  { text: '出售', ... },
]
```

Remove `this._synthesizeAction(item, false)`. Can delete `_synthesizeAction` if unused.

- [ ] **Step 6: Manual smoke in editor** — scroll to synth, put 3, preview cost, clear slot.

- [ ] **Step 7: Commit**

```bash
git add assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): equipment tab scroll synth panel and put-into-synth"
```

---

### Task 3: Wire controller with explicit instanceIds

**Files:**
- Modify: `assets/scripts/pve/controllers/CampController.ts`

**Interfaces:**
- Consumes: three slotted ids from view
- Produces: cloud SYNTHESIZE; clear slots; success popup

- [ ] **Step 1: Replace callback wiring**

```ts
onSynthesizeEquipmentSlots: (ids) => void this._synthesizeEquipmentSlots(ids),
```

Remove `onSynthesizeEquipment` / old `_synthesizeEquipment` that used `pickSynthesizeMaterials`.

- [ ] **Step 2: Implement**

```ts
private async _synthesizeEquipmentSlots(instanceIds: [string, string, string]): Promise<void> {
  if (this._busy || !this._view || !this._profile) return;
  const primary = this._profile.equipmentInventory.find((x) => x.instanceId === instanceIds[0]);
  if (!primary) {
    this._view.showResultPopup('操作失败', '未找到合成材料');
    return;
  }
  const nextQuality = nextEquipQuality(primary.quality);
  const cost = SYNTH_STARDUST[primary.quality as keyof typeof SYNTH_STARDUST];
  if (!nextQuality || cost == null) {
    this._view.showResultPopup('无法合成', '传奇装备无法继续合成');
    return;
  }
  if (this._profile.gold < cost) {
    this._view.showResultPopup('无法合成', '星尘不足');
    return;
  }
  const qualityNames = { COMMON: '普通', FINE: '精良', RARE: '稀有', EPIC: '史诗', LEGENDARY: '传说' } as const;
  const name = getFixedEquipmentDefinition(primary.definitionId).name;
  const beforeGold = this._profile.gold;
  this._busy = true;
  try {
    const { profile } = await manageCamp({
      type: 'EQUIPMENT',
      action: 'SYNTHESIZE',
      instanceIds,
    });
    this._profile = profile;
    if (!this._view.node.isValid) return;
    this._view.clearEquipmentSynthSlots();
    this._view.setProfile(profile);
    const spent = Math.max(0, beforeGold - profile.gold);
    this._view.showResultPopup(
      '合成成功',
      `${name}\n${qualityNames[primary.quality]} ×3 → ${qualityNames[nextQuality]} ×1\n消耗星尘 ${spent}\n剩余星尘 ${profile.gold}`,
    );
  } catch (err: unknown) {
    if (this._view?.node.isValid) {
      this._view.showResultPopup('合成失败', err instanceof Error ? err.message : String(err));
    }
  } finally {
    this._busy = false;
  }
}
```

Keep `pickSynthesizeMaterials` in `EquipmentProgression.ts` + its unit test (still useful); UI no longer calls it.

- [ ] **Step 3: Commit**

```bash
git add assets/scripts/pve/controllers/CampController.ts assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): wire equipment synth panel to cloud SYNTHESIZE"
```

---

### Task 4: Docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` (三合一 bullet)

- [ ] **Step 1: Append UI note**

Change the 三合一 line to mention: 营地装备台提供显式合成区（上 1 下 3）；背包详情用「投入合成」，不再一键自动挑料。

- [ ] **Step 2: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md
git commit -m "docs(pve): note equipment camp explicit synth panel"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Whole-page scroll | 2 |
| 1 result + 3 materials + lines | 1, 2 |
| 投入合成 / clear slots | 2 |
| Remove one-click 合成 | 2 |
| Existing SYNTHESIZE rules | 3 |
| Doc sync | 4 |

## Self-review

- No cloud formula change required.
- `pickSynthesizeMaterials` retained for unit tests only.
- Slot conflict validation happens client-side before button enable; cloud still authoritative.
