# Minghen Camp Synth UI + Explicit I→II Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make camp 命痕台 scrollable with larger one-line equipped cards, smaller one-line owned cards, a triangular synthesize panel, and require players to explicitly synthesize I→II (no auto level-up on 2nd copy).

**Architecture:** Keep `copies` as material progress; stop `grantCopy` / `addMinghenCopy` from auto-setting `level=2`. Add pure `synthesizeMinghenToII` on client + cloud (`manageCamp` type `SYNTHESIZE_MINGHEN`). CampView owns local synth slot state; CampController calls cloud and refreshes profile. Hide 保存方案 for this release.

**Tech Stack:** Cocos Creator 3.8.8 TS UI, Jest (`test/pve` + `cloudfunctions/common/__tests__`), WeChat cloud `cloudfunctions/common/pve/*` + `node scripts/sync-cloud-common.js`.

**Spec:** `docs/superpowers/specs/2026-07-28-minghen-camp-synth-ui-design.md`

## Global Constraints

- Only edit shared cloud source at `cloudfunctions/common/**`, then run `node scripts/sync-cloud-common.js`.
- Never hand-edit `cloudfunctions/*/common/**` copies.
- PVE gameplay / progression rule changes must sync design docs listed in Task 5.
- No new `enum`; use `as const` / string unions.
- Existing profiles already at `level: 2|3` stay as-is (grandfathered); only **new grants** stop auto I→II.
- Synthesize success: `level = 2`, **`copies` unchanged**; require `level === 1` and `copies >= 2`; reject if id is currently in `minghenLoadout`.
- III only via trial; synth never sets level 3.
- Hide 保存方案 button; keep `_savePreset` / callback wired but unused in UI.
- Grep cloud with `--glob '!cloudfunctions/*/common/**'`.

## File map

| File | Responsibility |
|---|---|
| `assets/scripts/pve/core/minghen/MinghenLoadout.ts` | Stop auto I→II on grant; add `canSynthesizeMinghenToII` / `synthesizeMinghenToII` |
| `cloudfunctions/common/pve/PveMinghen.js` | `grantCopy` / hunt settle preserve level (no auto II) |
| `cloudfunctions/common/pve/PveCamp.js` | `synthesizeMinghen(profile, { id })` |
| `cloudfunctions/common/pve/PveProgression.js` | `manageCamp` branch `SYNTHESIZE_MINGHEN` |
| `assets/scripts/network/PveProgressionService.ts` | Request union member |
| `assets/scripts/pve/views/CampMinghenLayout.ts` | Card sizes + synth geometry + scroll content height |
| `assets/scripts/pve/views/CampView.ts` | Scroll body, one-line cards, synth UI, 投入合成 |
| `assets/scripts/pve/controllers/CampController.ts` | `onSynthesizeMinghen` |
| Docs under `docs/superpowers/specs/` + catalog notes | Explicit synth wording |

---

### Task 1: Stop auto I→II + pure synthesize helper (client)

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenLoadout.ts`
- Modify: `test/pve/MinghenLoadout.test.ts`
- Create: `test/pve/MinghenSynthesize.test.ts`

**Interfaces:**
- Consumes: `MinghenCollectionEntry`, `PveProfile`-like `{ minghenCollection, minghenLoadout }`
- Produces:
  - `addMinghenCopy(entry, id)` → keeps prior `level` (default 1); only bumps `copies`
  - `canSynthesizeMinghenToII(profile, id): boolean`
  - `synthesizeMinghenToII(profile, id): PveProfile` (throws `Error` with `.code`)

- [ ] **Step 1: Rewrite failing expectation in `MinghenLoadout.test.ts`**

Replace the auto-level test with:

```ts
test('two copies stay level one until explicit synthesize; trial still gates three', () => {
  let entry: MinghenCollectionEntry | undefined;
  entry = addMinghenCopy(entry, 'M01');
  entry = addMinghenCopy(entry, 'M01');
  expect(entry).toMatchObject({ copies: 2, level: 1, trialCompleted: false });
  entry = addMinghenCopy(addMinghenCopy(entry, 'M01'), 'M01');
  expect(entry).toMatchObject({ copies: 4, level: 1, trialCompleted: false });
  expect(completeMinghenTrial({ ...entry, level: 2 })).toMatchObject({ level: 3, trialCompleted: true });
});
```

- [ ] **Step 2: Add `MinghenSynthesize.test.ts` failing tests**

```ts
import {
  canSynthesizeMinghenToII,
  synthesizeMinghenToII,
} from '../../assets/scripts/pve/core/minghen/MinghenLoadout';
import type { PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function stubProfile(partial: Partial<PveProfile> & { minghenCollection: PveProfile['minghenCollection'] }): PveProfile {
  return {
    gold: 0,
    minghenDust: 0,
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    professions: {} as PveProfile['professions'],
    selectedProfessionId: 'WARRIOR',
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    tracking: null,
    graduatedMinghenIds: [],
    dailyShop: null,
    partners: {},
    equippedPartnerId: null,
    updatedAt: 0,
    ...partial,
  } as PveProfile;
}

test('synthesize I→II when copies>=2 and unequipped', () => {
  const before = stubProfile({
    minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
  });
  expect(canSynthesizeMinghenToII(before, 'M01')).toBe(true);
  const after = synthesizeMinghenToII(before, 'M01');
  expect(after.minghenCollection.M01).toMatchObject({ level: 2, copies: 2 });
});

test('rejects equipped, insufficient copies, already II', () => {
  const equipped = stubProfile({
    minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } },
    minghenLoadout: [{ id: 'M01', level: 1 }],
  });
  expect(canSynthesizeMinghenToII(equipped, 'M01')).toBe(false);
  expect(() => synthesizeMinghenToII(equipped, 'M01')).toThrow('已装配');

  const short = stubProfile({
    minghenCollection: { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } },
  });
  expect(() => synthesizeMinghenToII(short, 'M01')).toThrow('副本不足');

  const already = stubProfile({
    minghenCollection: { M01: { id: 'M01', level: 2, copies: 2, trialCompleted: false } },
  });
  expect(() => synthesizeMinghenToII(already, 'M01')).toThrow('已是II');
});
```

(Adjust stub fields if `PveProfile` requires more keys — mirror a minimal object from an existing progression test fixture.)

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm run test:pve -- --testPathPattern="MinghenLoadout|MinghenSynthesize"`

Expected: FAIL on level still auto-2 / missing synthesize exports.

- [ ] **Step 4: Implement in `MinghenLoadout.ts`**

```ts
export function addMinghenCopy(entry: MinghenCollectionEntry | undefined, id: string): MinghenCollectionEntry {
  getMinghenDefinition(id);
  const copies = (entry?.copies ?? 0) + 1;
  return {
    id,
    copies,
    trialCompleted: entry?.trialCompleted ?? false,
    level: entry?.level ?? 1,
  };
}

export function completeMinghenTrial(entry: MinghenCollectionEntry): MinghenCollectionEntry {
  if (entry.copies < MINGHEN_COPY_REQUIREMENTS[3]) {
    throw new Error('MINGHEN_TRIAL_COPIES_REQUIRED');
  }
  return { ...entry, trialCompleted: true, level: 3 };
}

export function canSynthesizeMinghenToII(
  profile: { minghenCollection: Record<string, MinghenCollectionEntry>; minghenLoadout: readonly { id: string }[] },
  id: string,
): boolean {
  const owned = profile.minghenCollection[id];
  if (!owned) return false;
  if (owned.level !== 1) return false;
  if (owned.copies < MINGHEN_COPY_REQUIREMENTS[2]) return false;
  if (profile.minghenLoadout.some((x) => x.id === id)) return false;
  return true;
}

export function synthesizeMinghenToII<T extends {
  minghenCollection: Record<string, MinghenCollectionEntry>;
  minghenLoadout: readonly { id: string }[];
}>(profile: T, id: string): T {
  const fail = (code: string, message: string): never => {
    const err = new Error(message) as Error & { code: string };
    err.code = code;
    throw err;
  };
  getMinghenDefinition(id);
  const owned = profile.minghenCollection[id];
  if (!owned) fail('PVE_MINGHEN_NOT_OWNED', '未持有该命痕');
  if (profile.minghenLoadout.some((x) => x.id === id)) fail('PVE_MINGHEN_EQUIPPED', '已装配命痕不能用于合成');
  if (owned.level !== 1) fail('PVE_MINGHEN_ALREADY_II', '已是II级或更高');
  if (owned.copies < MINGHEN_COPY_REQUIREMENTS[2]) fail('PVE_MINGHEN_COPIES_SHORT', '副本不足，需要至少2枚');
  return {
    ...profile,
    minghenCollection: {
      ...profile.minghenCollection,
      [id]: { ...owned, level: 2 },
    },
  };
}
```

Keep `highestCraftableMinghenLevel` only if still referenced; if unused after this change, delete it and update imports. If still used for UI hints, redefine as “max craftable preview” without mutating grant:

```ts
export function highestCraftableMinghenLevel(entry: Pick<MinghenCollectionEntry, 'copies' | 'trialCompleted' | 'level'>): MinghenLevel {
  if (entry.copies >= MINGHEN_COPY_REQUIREMENTS[3] && entry.trialCompleted) return 3;
  if (entry.level >= 2 || entry.copies >= MINGHEN_COPY_REQUIREMENTS[2]) return entry.level >= 2 ? Math.max(entry.level, 2) as MinghenLevel : 2;
  return 1;
}
```

Prefer: leave a small `previewSynthesizeLevel(entry)` used only by UI, and remove auto-craft usage from grant paths.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm run test:pve -- --testPathPattern="MinghenLoadout|MinghenSynthesize"`

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/core/minghen/MinghenLoadout.ts test/pve/MinghenLoadout.test.ts test/pve/MinghenSynthesize.test.ts
git commit -m "feat(pve): require explicit minghen I to II synthesize"
```

---

### Task 2: Cloud grantCopy + SYNTHESIZE_MINGHEN

**Files:**
- Modify: `cloudfunctions/common/pve/PveMinghen.js`
- Modify: `cloudfunctions/common/pve/PveCamp.js`
- Modify: `cloudfunctions/common/pve/PveProgression.js`
- Modify: `cloudfunctions/common/__tests__/PveMinghen.test.js`
- Modify: `cloudfunctions/common/__tests__/PveCamp.test.js`
- Modify: `assets/scripts/network/PveProgressionService.ts`
- Run: `node scripts/sync-cloud-common.js`

**Interfaces:**
- Consumes: Task 1 rules
- Produces:
  - `grantCopy` / hunt settle: `copies++`, **preserve `level`** (do not call old auto `levelFor` for II)
  - `synthesizeMinghen(profile, { id })` exported from `PveCamp.js`
  - `manageCamp({ type: 'SYNTHESIZE_MINGHEN', id })`
  - Client: `| { type: 'SYNTHESIZE_MINGHEN'; id: string }`

- [ ] **Step 1: Update `PveMinghen.test.js` expectations**

Change:

```js
test('copies stop at level two until trial succeeds', () => {
  let c = {};
  for (let i = 0; i < 4; i += 1) c = grantCopy(c, 'M01');
  expect(c.M01).toMatchObject({ copies: 4, level: 1, trialCompleted: false });
});
```

Update hunt test fixtures that assumed grant auto-set `level: 2` when only copies increased — hunting on an entry that was already II stays II; hunting that starts from I stays I while copies grow.

Example hunt setup:

```js
minghenCollection: { M01: { id: 'M01', level: 1, copies: 2, trialCompleted: false } }
// after hunt bonus to copies 4:
expect(r.collection.M01).toMatchObject({ copies: 4, level: 1 });
```

Trial still requires `copies >= 4` and sets `level: 3`. Loadout in trial challenge may still list `{ id, level: 2 }` only if the player already synthesized — for trial tests that need level 2 equipped, seed `level: 2` explicitly.

- [ ] **Step 2: Patch `PveMinghen.js`**

```js
function grantCopy(collection, id) {
  const old = collection[id] ?? { id, level: 1, copies: 0, trialCompleted: false };
  const next = { ...old, copies: old.copies + 1 };
  // Keep explicit level; I→II is camp synthesize only. III only via trial.
  return { ...collection, [id]: next };
}
```

In HUNT branch, replace `next.level = levelFor(next)` with preserving `old.level` (only update `copies`). Remove unused `levelFor` if nothing else needs it, or keep only for docs comments.

- [ ] **Step 3: Add synthesize + camp tests**

In `PveCamp.js`:

```js
function synthesizeMinghen(profile, request) {
  const id = typeof request.id === 'string' ? request.id : '';
  if (!id) fail('PVE_INVALID_MINGHEN_ID', '命痕无效');
  const owned = profile.minghenCollection?.[id];
  if (!owned) fail('PVE_MINGHEN_NOT_OWNED', '未持有该命痕');
  if ((profile.minghenLoadout || []).some((x) => x.id === id)) {
    fail('PVE_MINGHEN_EQUIPPED', '已装配命痕不能用于合成');
  }
  if (owned.level !== 1) fail('PVE_MINGHEN_ALREADY_II', '已是II级或更高');
  if ((owned.copies || 0) < 2) fail('PVE_MINGHEN_COPIES_SHORT', '副本不足，需要至少2枚');
  return {
    ...profile,
    minghenCollection: {
      ...profile.minghenCollection,
      [id]: { ...owned, level: 2 },
    },
  };
}

module.exports = {
  // existing...
  synthesizeMinghen,
};
```

In `PveProgression.js` `manageCamp`:

```js
else if (request.type === 'SYNTHESIZE_MINGHEN') next = synthesizeMinghen(profile, request);
```

Import `synthesizeMinghen` from `./PveCamp`.

Add tests in `PveCamp.test.js` mirroring client cases.

- [ ] **Step 4: Extend client request type**

```ts
| { type: 'SYNTHESIZE_MINGHEN'; id: string }
```

- [ ] **Step 5: Run cloud tests**

Run: `cd cloudfunctions/common && npm test -- --testPathPattern="PveMinghen|PveCamp"`

Expected: PASS

- [ ] **Step 6: Sync copies**

Run: `node scripts/sync-cloud-common.js`

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/common/pve/PveMinghen.js cloudfunctions/common/pve/PveCamp.js cloudfunctions/common/pve/PveProgression.js cloudfunctions/common/__tests__/PveMinghen.test.js cloudfunctions/common/__tests__/PveCamp.test.js assets/scripts/network/PveProgressionService.ts cloudfunctions/login/common cloudfunctions/pve/common cloudfunctions/initDb/common cloudfunctions/adminLogin/common cloudfunctions/adminTool/common
git commit -m "feat(pve): cloud explicit minghen synthesize and stop auto II"
```

---

### Task 3: Camp minghen layout + scroll + synth UI (local)

**Files:**
- Modify: `assets/scripts/pve/views/CampMinghenLayout.ts`
- Modify: `assets/scripts/pve/views/CampView.ts`
- Modify: `assets/scripts/pve/core/minghen/MinghenDisplay.ts` (optional one-line helpers)

**Interfaces:**
- Consumes: `formatMinghenLevelMark`, `canSynthesizeMinghenToII`
- Produces: UI-only staging; callback `onSynthesizeMinghen?(id: string)` (wired in Task 4)
- Local state on `CampView`: `_synthSlots: [string | null, string | null]`

**Layout targets (tune ±4px if clipping):**

```ts
export const CAMP_MINGHEN_LAYOUT = {
  bodyWidth: 570,
  bodyHeight: 620, // viewport; content scrolls inside
  equippedSlots: 10,
  columns: 5,
  cardWidth: 108,
  cardHeight: 64,
  cardGap: 8,
  // Y positions become offsets inside scroll content (top → bottom)
  summaryY: 0,
  equippedTitleY: -50,
  firstRowY: -100,
  ownedTitleY: -260,
  ownedStartY: -310,
  ownedCardWidth: 132,
  ownedCardHeight: 48,
  ownedFontSize: 16,
  synthTitleY: /* after owned block */,
  synthResult: { x: 0, y: /* */ },
  synthInputLeft: { x: -90, y: /* */ },
  synthInputRight: { x: 90, y: /* */ },
  synthButton: { x: 0, y: /* */, width: 160, height: 48 },
} as const;
```

Compute owned block height from `ownedCount` rows; place synth section below; set scroll `content` height = distance from top summary to below synth button + padding.

- [ ] **Step 1: Update `CampMinghenLayout.ts` constants** for wider/taller equipped cards and synth rects (include helper `ownedRowsHeight(count)`).

- [ ] **Step 2: Refactor `_renderMinghen` to build into a vertical ScrollView**

Pattern (mirror existing `_scrollGrid` Mask+ScrollView, but one content column):

1. Clear body.
2. Create `MinghenScroll` viewport sized `570×620` at `(0,0)` inside `_body`.
3. Content node tall enough for summary + equipped + owned grid + synth.
4. Draw sections into **content**, not `_body` directly.
5. Do **not** render 保存方案.
6. Equipped label: one line `` `${name} ${formatMinghenLevelMark(level)}` `` (no `\n`).
7. Owned label: one line `` `${name} ${mark} ·×${copies}${spare>0?`(余${spare})`:''}` `` with smaller font (set Label `fontSize` on card after `makeFlatButton`, e.g. 16).

- [ ] **Step 3: Draw synth triangle**

- Section title `命痕合成`.
- Result slot (dashed border when empty).
- Graphics lines from each input center to result center.
- Two input slots; click clears that slot.
- `合成` button: `interactable` only when both slots same id and `canSynthesizeMinghenToII(profile, id)`.

Result preview text when valid: `` `${getMinghenDefinition(id).name} II` `` else `需同名 I×2` / empty.

- [ ] **Step 4: Detail `投入合成`**

In `_showMinghenDetail` for `equipped === false`:

```ts
const canPut = /* level===1 && copies>=2 && not already both slots filled with need for this id */;
actions = [
  { text: '装配', action: () => this._callbacks.onToggleMinghen(id) },
  { text: '追踪', action: () => this._callbacks.onTrackMinghen(id) },
  {
    text: canPut ? '投入合成' : '投入合成',
    disabled: !this._canPutMinghenIntoSynth(id),
    action: () => this._putMinghenIntoSynth(id),
  },
];
```

`_putMinghenIntoSynth(id)`:
- Validate I / unequipped / available copies vs how many slots already hold this id (`need copies >= slottedCount+1`).
- Fill first null slot; if full, `showNotice('合成槽已满，请先点材料格卸下')`.
- Re-render minghen section **or** refresh synth labels only (prefer full `_renderMinghen` while preserving scroll offset if easy; else reset scroll).

Available copies for staging: for `level===1`, available = `entry.copies` (both slots may take same id if `copies >= 2`).

- [ ] **Step 5: Synth button action (UI gate)**

If Task 4 not merged yet, call `onSynthesizeMinghen?.(id)` when present; else `showNotice('合成规则接通中')`. Prefer wiring stub callback in constructor type now:

```ts
onSynthesizeMinghen(id: string): void;
```

CampController can no-op notice until Task 4 — or implement Task 4 immediately after.

- [ ] **Step 6: Manual check in editor**

- Equipped one-line, larger cards.
- Owned smaller one-line.
- Page scrolls to synth.
- 保存方案 hidden.
- Put two same I → preview II; clear slot works.

- [ ] **Step 7: Commit**

```bash
git add assets/scripts/pve/views/CampMinghenLayout.ts assets/scripts/pve/views/CampView.ts assets/scripts/pve/controllers/CampController.ts
git commit -m "feat(pve): camp minghen scroll layout and synth panel UI"
```

---

### Task 4: Wire CampController synthesize

**Files:**
- Modify: `assets/scripts/pve/controllers/CampController.ts`
- Modify: `assets/scripts/pve/views/CampView.ts` (clear slots on success)

**Interfaces:**
- Consumes: `manageCamp({ type: 'SYNTHESIZE_MINGHEN', id })`
- Produces: profile refresh + success popup

- [ ] **Step 1: Add callback in `open()`**

```ts
onSynthesizeMinghen: (id) => void this._synthesizeMinghen(id),
```

- [ ] **Step 2: Implement `_synthesizeMinghen`**

```ts
private async _synthesizeMinghen(id: string): Promise<void> {
  if (this._busy || !this._view || !this._profile) return;
  if (!canSynthesizeMinghenToII(this._profile, id)) {
    this._view.showResultPopup('无法合成', '需要未装配的同名 I 级命痕，且副本至少 2 枚');
    return;
  }
  const name = getMinghenDefinition(id).name;
  this._busy = true;
  try {
    const { profile } = await manageCamp({ type: 'SYNTHESIZE_MINGHEN', id });
    this._profile = profile;
    if (!this._view.node.isValid) return;
    this._view.clearMinghenSynthSlots(); // add public method
    this._view.setProfile(profile);
    this._view.showResultPopup('合成成功', `${name}\nI ×2 → II`);
  } catch (err: unknown) {
    if (this._view?.node.isValid) {
      this._view.showResultPopup('合成失败', err instanceof Error ? err.message : String(err));
    }
  } finally {
    this._busy = false;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/scripts/pve/controllers/CampController.ts assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): wire camp minghen synthesize to cloud"
```

---

### Task 5: Docs sync

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-minghen-acquisition-economy-design.md` §4 — add “须在营地命痕台显式合成，获得第 2 枚副本不会自动升 II”
- Modify: `specs/260712-pve-persistent-floor-progression/minghen-catalog.md` — same note near合成公式
- Grep `自动` / `copies >= 2` / `升为 II` under `specs/260608-pve-destiny-expedition/` and progression docs; update if they claim auto upgrade
- If `specs/260608-pve-destiny-expedition/design.md` mentions minghen level-from-copies, sync per gameplay-design-doc rule

- [ ] **Step 1: Apply doc edits**

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-minghen-acquisition-economy-design.md specs/260712-pve-persistent-floor-progression/minghen-catalog.md specs/260608-pve-destiny-expedition/design.md
git commit -m "docs(pve): note explicit minghen I to II synthesize at camp"
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Larger one-line equipped cards | 3 |
| Smaller one-line owned cards | 3 |
| Synth triangle + lines | 3 |
| 投入合成 in detail | 3 |
| Whole-page vertical scroll | 3 |
| Hide 保存方案 | 3 |
| No auto I→II on grant | 1, 2 |
| Explicit synthesize copies unchanged | 1, 2, 4 |
| Equipped cannot be material | 1–4 |
| III via trial only | 1, 2 |
| Doc sync | 5 |

## Self-review notes

- No TBD placeholders in task steps.
- `MINGHEN_COPY_REQUIREMENTS[2] === 2` is the copies gate; level gate is explicit `level === 1`.
- Grandfathered II profiles remain valid; new grants stay I until synth.
- Shop / exchange tests that assumed `grantCopy` → level 2 must be updated in Task 2 (re-run full `PveMinghenShop` tests).
