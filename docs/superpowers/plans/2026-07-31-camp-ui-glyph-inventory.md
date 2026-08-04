# Camp UI Glyph + Shared Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup camp Minghen/Equipment UI into equal square slots, code-drawn hieroglyph constellation glyphs for minghen, and a fixed 25-slot shared filtered bag that does not shift the synth section.

**Architecture:** Keep `CampView` + existing controllers. Add pure modules for glyph geometry and shared-bag item lists (no `cc`). Unify slot size via shared layout constants. Render glyphs with `Graphics` in a thin view helper. Outer scroll metrics always assume 25 bag slots; overflow uses an inner scroll only.

**Tech Stack:** Cocos Creator 3.8.8 TypeScript, Jest (`npm run test:pve`), existing `CampView` / Layout / `PveProfile` types.

## Global Constraints

- PVE `core/` must not `import 'cc'`; no direct `Math.random()` in core (use deterministic hash from id).
- UI-only scope: no cloud bag-capacity economy, no inventory schema merge.
- `CAMP_SLOT_SIZE = 96`; bag UI capacity `CAMP_BAG_SLOTS = 25` (5×5).
- Every glyph star point degree ≥ 1 (no orphans); same id → identical glyph.
- Sync already done for `design.md` / glyph inventory design; do not expand scope into upgrade economy.
- Prefer minimal `CampView` edits; extract pure logic to testable modules.

## File Map

| File | Role |
|---|---|
| Create `assets/scripts/pve/core/minghen/MinghenGlyph.ts` | Deterministic glyph data from minghen id |
| Create `assets/scripts/pve/views/MinghenGlyphPainter.ts` | `Graphics` draw of glyph data (may import `cc`) |
| Create `assets/scripts/pve/views/CampLayoutConstants.ts` | Shared `CAMP_SLOT_SIZE`, bag cols/slots/gap |
| Create `assets/scripts/pve/views/CampSharedBag.ts` | Build filtered shared-bag entries from `PveProfile` |
| Modify `assets/scripts/pve/views/CampMinghenLayout.ts` | Square 96 slots; metrics keyed off fixed 25 bag rows |
| Modify `assets/scripts/pve/views/CampEquipmentLayout.ts` | Align sizes; metrics keyed off fixed 25 bag rows |
| Modify `assets/scripts/pve/views/CampView.ts` | Square glyphs, filter chips, fixed bag, material detail |
| Create `test/pve/MinghenGlyph.test.ts` | Stability + no orphan points for M01–M56 |
| Create `test/pve/CampSharedBag.test.ts` | Filter / uneqipped / materials entries |
| Modify `test/pve/CampMinghenLayout.test.ts` | Fixed-height bag metrics |
| Modify `test/pve/CampEquipmentLayout.test.ts` | Fixed-height bag metrics |

---

### Task 1: MinghenGlyph pure geometry

**Files:**
- Create: `assets/scripts/pve/core/minghen/MinghenGlyph.ts`
- Test: `test/pve/MinghenGlyph.test.ts`

**Interfaces:**
- Consumes: none (id string only; optional category later)
- Produces:
  - `export interface MinghenGlyphPoint { x: number; y: number }` // normalized roughly [-1,1]
  - `export interface MinghenGlyphStroke { a: number; b: number }` // point indices
  - `export type MinghenGlyphTint = 'cyan' | 'violet' | 'gold'`
  - `export interface MinghenGlyphData { points: MinghenGlyphPoint[]; strokes: MinghenGlyphStroke[]; tint: MinghenGlyphTint }`
  - `export function buildMinghenGlyph(id: string): MinghenGlyphData`
  - `export function glyphPointDegrees(data: MinghenGlyphData): number[]`
  - `export function isGlyphFullyConnected(data: MinghenGlyphData): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { MINGHEN_CATALOG } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import {
  buildMinghenGlyph,
  glyphPointDegrees,
  isGlyphFullyConnected,
} from '../../assets/scripts/pve/core/minghen/MinghenGlyph';

describe('MinghenGlyph', () => {
  test('same id yields identical glyph', () => {
    const a = buildMinghenGlyph('M05');
    const b = buildMinghenGlyph('M05');
    expect(a).toEqual(b);
  });

  test('every catalog id has 4–7 points, strokes, and no orphan points', () => {
    for (const def of MINGHEN_CATALOG) {
      const g = buildMinghenGlyph(def.id);
      expect(g.points.length).toBeGreaterThanOrEqual(4);
      expect(g.points.length).toBeLessThanOrEqual(7);
      expect(g.strokes.length).toBeGreaterThanOrEqual(1);
      expect(isGlyphFullyConnected(g)).toBe(true);
      for (const deg of glyphPointDegrees(g)) expect(deg).toBeGreaterThanOrEqual(1);
    }
  });

  test('different ids are not all identical', () => {
    const a = JSON.stringify(buildMinghenGlyph('M01'));
    const b = JSON.stringify(buildMinghenGlyph('M16'));
    const c = JSON.stringify(buildMinghenGlyph('M40'));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pve -- MinghenGlyph.test.ts`
Expected: FAIL (module missing / `buildMinghenGlyph` not found)

- [ ] **Step 3: Write minimal implementation**

Implement `MinghenGlyph.ts`:

1. `hashId(id)` — FNV-ish or simple char code mix → uint32 (deterministic).
2. Hardcode ≥6 **fully connected** template graphs (staff, eye, mountain, hook, angle, gate) as point lists + stroke index pairs in normalized coords. Every template must already satisfy degree ≥ 1.
3. `templateIndex = hash % templates.length`.
4. Optional tiny jitter: multiply a subset of points by `1 + ((hash >> k) & 7) * 0.01` **without removing strokes**; after jitter, re-run `isGlyphFullyConnected`; if false, return the unjittered template.
5. Tint from `hash % 3`.
6. Export helpers:

```ts
export function glyphPointDegrees(data: MinghenGlyphData): number[] {
  const deg = data.points.map(() => 0);
  for (const s of data.strokes) {
    deg[s.a]! += 1;
    deg[s.b]! += 1;
  }
  return deg;
}

export function isGlyphFullyConnected(data: MinghenGlyphData): boolean {
  return glyphPointDegrees(data).every((d) => d >= 1);
}
```

Do **not** generate random orphan stars. Prefer selecting among validated templates over procedural free points.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pve -- MinghenGlyph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/minghen/MinghenGlyph.ts test/pve/MinghenGlyph.test.ts
git commit -m "feat(pve): deterministic minghen constellation glyphs"
```

---

### Task 2: Shared layout constants + fixed 25-slot metrics

**Files:**
- Create: `assets/scripts/pve/views/CampLayoutConstants.ts`
- Modify: `assets/scripts/pve/views/CampMinghenLayout.ts`
- Modify: `assets/scripts/pve/views/CampEquipmentLayout.ts`
- Modify: `test/pve/CampMinghenLayout.test.ts`
- Modify: `test/pve/CampEquipmentLayout.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export const CAMP_SLOT_SIZE = 96`
  - `export const CAMP_SLOT_GAP = 8`
  - `export const CAMP_BAG_COLS = 5`
  - `export const CAMP_BAG_SLOTS = 25`
  - `minghenContentMetrics()` **no longer depends on owned item count for height** (may keep unused arg removed)
  - `equipmentContentMetrics()` likewise keyed off fixed bag rows = `CAMP_BAG_SLOTS / CAMP_BAG_COLS`

- [ ] **Step 1: Write/adjust failing layout tests**

Replace dynamic-height expectations with fixed-height ones:

```ts
// CampMinghenLayout.test.ts (key asserts)
expect(CAMP_MINGHEN_LAYOUT.cardWidth).toBe(96);
expect(CAMP_MINGHEN_LAYOUT.cardHeight).toBe(96);
const a = minghenContentMetrics();
const b = minghenContentMetrics(); // if signature drops count
expect(a.synthTitleY).toBe(b.synthTitleY);
expect(a.contentHeight).toBe(b.contentHeight);

// CampEquipmentLayout.test.ts
expect(CAMP_EQUIPMENT_LAYOUT.bagSize).toBe(96);
expect(CAMP_EQUIPMENT_LAYOUT.loadoutSlotSize).toBe(96);
expect(CAMP_EQUIPMENT_LAYOUT.synthSlotSize).toBe(96);
const empty = equipmentContentMetrics();
const full = equipmentContentMetrics();
expect(empty.synthTitleY).toBe(full.synthTitleY);
```

Delete tests that assert `empty.synthTitleY > withItems.synthTitleY` / `bagRows(0) === 0` as layout drivers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:pve -- CampMinghenLayout.test.ts CampEquipmentLayout.test.ts`
Expected: FAIL on size and/or fixed metrics

- [ ] **Step 3: Implement constants + layout**

`CampLayoutConstants.ts`:

```ts
export const CAMP_SLOT_SIZE = 96;
export const CAMP_SLOT_GAP = 8;
export const CAMP_BAG_COLS = 5;
export const CAMP_BAG_SLOTS = 25;
export const CAMP_BAG_ROWS = CAMP_BAG_SLOTS / CAMP_BAG_COLS; // 5
```

Update both layout modules to import these. Minghen cards/synth slots become squares of `CAMP_SLOT_SIZE`. Bag block height always:

`CAMP_BAG_ROWS * (CAMP_SLOT_SIZE + CAMP_SLOT_GAP) - CAMP_SLOT_GAP` (or include gap consistently with existing row math).

`minghenContentMetrics()` / `equipmentContentMetrics()`: remove count-based row growth; always use `CAMP_BAG_ROWS`.

Keep viewportWidth/Height unless a square grid overflows — if 5×96+gaps > 570, reduce gap to 6 or shrink title paddings so total width ≤ 570:

`5 * 96 + 4 * gap ≤ 570` → gap ≤ 22.5; use `CAMP_SLOT_GAP = 8` → width 512, OK.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pve -- CampMinghenLayout.test.ts CampEquipmentLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/CampLayoutConstants.ts \
  assets/scripts/pve/views/CampMinghenLayout.ts \
  assets/scripts/pve/views/CampEquipmentLayout.ts \
  test/pve/CampMinghenLayout.test.ts \
  test/pve/CampEquipmentLayout.test.ts
git commit -m "refactor(pve): unify camp slot size and fixed bag metrics"
```

---

### Task 3: Shared bag item list builder

**Files:**
- Create: `assets/scripts/pve/views/CampSharedBag.ts`
- Test: `test/pve/CampSharedBag.test.ts`

**Interfaces:**
- Consumes: `PveProfile`, `normalizeCampMaterials`, minghen collection/loadout rules
- Produces:
  - `export type CampBagFilter = 'MINGHEN' | 'EQUIPMENT' | 'MATERIAL' | 'ALL'`
  - `export type CampBagEntry =`
    - `{ kind: 'MINGHEN'; id: string; level: 1|2|3; bagCopies: number }`
    - `| { kind: 'EQUIPMENT'; instanceId: string }`
    - `| { kind: 'MATERIAL'; materialId: 'QUENCH_SAND' | 'FUSION_CORE'; amount: number }`
  - `export function buildCampSharedBagEntries(profile: PveProfile, filter: CampBagFilter): CampBagEntry[]`
  - `export function defaultCampBagFilter(section: 'MINGHEN' | 'EQUIPMENT'): CampBagFilter`

Rules:

- Minghen: `bagCopies = max(0, copies - (inLoadout ? 1 : 0))`; skip if 0.
- Equipment: instances whose `instanceId` not in `equipmentLoadout` values.
- Materials: always include quench/fusion rows when `filter` is `MATERIAL` or `ALL` (even if amount 0? Prefer include only if `amount > 0` OR always show both for discoverability — **always show both material types** when filter is MATERIAL/ALL so players see the slots).
- Order: minghen ids ascending, then equipment as inventory order, then materials quench then fusion.

- [ ] **Step 1: Write the failing test**

Use a minimal fake profile object (only fields the builder reads). Assert filters and uneqipped minghen copy math.

```ts
test('minghen filter hides equipped-only copies', () => {
  const profile = {/* minghenCollection M01 copies:1, loadout includes M01, equipment empty, materials */} ;
  const entries = buildCampSharedBagEntries(profile, 'MINGHEN');
  expect(entries.find((e) => e.kind === 'MINGHEN' && e.id === 'M01')).toBeUndefined();
});

test('default filter follows section', () => {
  expect(defaultCampBagFilter('MINGHEN')).toBe('MINGHEN');
  expect(defaultCampBagFilter('EQUIPMENT')).toBe('EQUIPMENT');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pve -- CampSharedBag.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `CampSharedBag.ts`**

Keep file free of `cc` imports (it lives under `views/` but must stay pure for Jest; do not import Graphics).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:pve -- CampSharedBag.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/CampSharedBag.ts test/pve/CampSharedBag.test.ts
git commit -m "feat(pve): shared camp bag entry builder with filters"
```

---

### Task 4: Glyph painter + Minghen equipped/synth square slots

**Files:**
- Create: `assets/scripts/pve/views/MinghenGlyphPainter.ts`
- Modify: `assets/scripts/pve/views/CampView.ts` (`_renderMinghen`, `_renderMinghenSynth`, replace `_gridCard` text slots for minghen)

**Interfaces:**
- Consumes: `buildMinghenGlyph`, `CAMP_SLOT_SIZE`
- Produces: `export function paintMinghenGlyph(graphics: Graphics, data: MinghenGlyphData, size: number): void`

Painter behavior:

1. Clear not required if new Graphics; draw dark circle inset.
2. Map normalized points to local pixel coords within `size * 0.72`.
3. For each stroke: draw glow (wider, low alpha) then core line (cyan/violet/gold).
4. For each point: glow circle + bright core.
5. No Label with minghen name on the slot.

CampView changes for this task (Minghen tab only):

- Equipped loop: for `i in 0..9`, draw square empty or glyph button; click → existing `_showMinghenDetail`.
- Synth input slots: show glyph when filled; result stays empty placeholder (no preview text name — keep empty).
- Leave owned/bag list for Task 5 (can temporarily keep old owned list OR remove it if it conflicts — prefer remove old owned block and leave a TODO comment only if Task 5 follows immediately in same session; otherwise keep old owned until Task 5 replaces it in the same PR sequence).

**Preferred:** In Task 4, stop rendering the old text “拥有的命痕” grid; render filter chips + empty fixed 25 frames as stubs (clicks no-op) so layout already stable; Task 5 fills cells.

- [ ] **Step 1: Implement painter**

```ts
import { Color, Graphics } from 'cc';
import type { MinghenGlyphData } from '../core/minghen/MinghenGlyph';

const TINT: Record<MinghenGlyphData['tint'], Color> = {
  cyan: new Color(126, 240, 255, 255),
  violet: new Color(198, 180, 255, 255),
  gold: new Color(255, 230, 140, 255),
};

export function paintMinghenGlyph(g: Graphics, data: MinghenGlyphData, size: number): void {
  const color = TINT[data.tint];
  const r = size * 0.42;
  g.fillColor = new Color(7, 21, 38, 255);
  g.circle(0, 0, r);
  g.fill();
  // glow strokes then core strokes, then points — scale data.points from [-1,1] by size*0.32
}
```

- [ ] **Step 2: Wire equipped + synth in `CampView._renderMinghen`**

Use `makeFlatButton` square `CAMP_SLOT_SIZE`; hide Label; add child node with Graphics + `paintMinghenGlyph`.

- [ ] **Step 3: Manual smoke (editor or wechat preview)**

Open camp → Minghen tab: 10 square slots, glyphs on equipped, synth inputs show glyphs, no orphan dots visible on a few samples (M01/M05/M16).

- [ ] **Step 4: Run related unit tests**

Run: `npm run test:pve -- MinghenGlyph.test.ts CampMinghenLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/MinghenGlyphPainter.ts assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): paint minghen glyphs on camp equip and synth slots"
```

---

### Task 5: Shared 25-slot bag UI on both tabs

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts` (`_renderMinghen`, `_renderEquipment`, new helpers)

**Interfaces:**
- Consumes: `buildCampSharedBagEntries`, `defaultCampBagFilter`, layout metrics, painter, existing equipment icon helpers, detail popups
- Produces: CampView private state `_bagFilter: CampBagFilter` reset on section change via `defaultCampBagFilter`

Behavior:

1. On `showSection('MINGHEN'|'EQUIPMENT')`, set `_bagFilter = defaultCampBagFilter(section)`.
2. Render filter chips row under loadout; clicking a chip sets `_bagFilter` and re-`showSection` (or rebuild body) without changing outer metrics.
3. Outer bag region height from layout (fixed 25). Always create 25 square frames.
4. `entries = buildCampSharedBagEntries(profile, _bagFilter)`.
5. If `entries.length <= 25`: place into frames 0..n-1; rest empty (non-interactable).
6. If `entries.length > 25`: create inner `ScrollView` inside the fixed bag bounds; still square cells; outer synth Y unchanged. Summary shows `持有 ${entries.length}` and `容量 25`.
7. Cell content:
   - MINGHEN → glyph + optional tiny `×N` corner label if `bagCopies > 1`
   - EQUIPMENT → existing icon attach
   - MATERIAL → simple colored square + amount text (no art asset required)
8. Clicks: minghen/equipment → existing detail; material → Task 6 popup (for now call a stub `showResultPopup` with name/amount if Task 6 not merged yet — prefer implement Task 6 immediately after).

Apply the same bag block to Equipment tab; remove old dynamic `_bagIconCard` loop driven by `bagItems.length` for layout height (icons still used inside fixed grid).

- [ ] **Step 1: Add `_bagFilter` + filter chip UI helper**

Chip labels: `命痕` / `装备` / `材料` / `全部` mapping to filter enums.

- [ ] **Step 2: Implement `_renderSharedBag(parent, profile, firstRowY, iconRevision)`**

Shared by both section renderers.

- [ ] **Step 3: Update `_renderEquipment` to use shared bag + fixed metrics API**

Remove `equipmentContentMetrics(bagCount)` count argument usage.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:pve -- CampSharedBag.test.ts CampMinghenLayout.test.ts CampEquipmentLayout.test.ts MinghenGlyph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): fixed 25-slot shared camp bag with filters"
```

---

### Task 6: Material detail popup + AC pass

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts` (material detail modal)
- Modify: `docs/superpowers/specs/2026-07-31-camp-ui-glyph-inventory-design.md` (status → 实现中/已完成计划)

**Interfaces:**
- Consumes: material entry from shared bag
- Produces: `_showMaterialDetail(materialId, amount)` — title/用途/持有量；关闭按钮；no actions

Copy:

- `QUENCH_SAND` → 淬星砂；用途：装备强化
- `FUSION_CORE` → 聚星核；用途：装备三合一升品

- [ ] **Step 1: Implement `_showMaterialDetail`** mirroring `showResultPopup` panel style (reuse PANEL/BORDER colors).

- [ ] **Step 2: Wire material cell clicks**

- [ ] **Step 3: AC checklist (manual)**

1. Minghen + equipment slots are squares size 96.
2. Minghen cells show glyphs only (name in detail).
3. Spot-check several glyphs — no lone unconnected dots (especially templates that previously orphaned).
4. Add/remove items / switch filters — synth block does not jump.
5. Defaults: Minghen tab → 命痕 filter; Equipment tab → 装备 filter; 全部 mixes.
6. Equip/unequip, enhance, sell, both synths still work.

- [ ] **Step 4: Full pve test suite**

Run: `npm run test:pve`
Expected: PASS (fix any layout test fallout)

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/CampView.ts docs/superpowers/specs/2026-07-31-camp-ui-glyph-inventory-design.md
git commit -m "feat(pve): material bag detail and camp UI AC wrap-up"
```

---

## Self-Review

1. **Spec coverage:** Glyph module (§5) → Task 1/4; fixed 25 + filters (§3–4) → Task 2/3/5; square 96 (§6) → Task 2; material detail (§4) → Task 6; no cloud economy (§8) — omitted intentionally.
2. **Placeholders:** None left; painter tint colors and filter labels specified.
3. **Type consistency:** `CampBagFilter` / `CampBagEntry` / `MinghenGlyphData` names reused across tasks; layout metrics lose count parameters consistently in Tasks 2 and 5.
