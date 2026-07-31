# Lobby Check-In Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship lobby monthly check-in (daily calendar + cumulative milestones + makeup cards) with cloud-authoritative grants of 星尘 / 淬星砂 / 聚星核 / 虚空革 / 补签卡.

**Architecture:** Pure logic in `PveCheckIn.js` (reward tables, month rollover, sign / makeup / claim). Persist via `pveProfile.checkIn` normalized in `PveProfile.js`. Expose `checkIn` action on `pve` cloud function. Lobby `CheckInView` + entry beside mail; GM `adjustResources` gains `makeupCards`.

**Tech Stack:** Cocos Creator 3.8.8 TS client; WeChat cloud Node.js (`cloudfunctions/common`); Jest (`cloudfunctions/common/__tests__`, `test/pve`); `node scripts/sync-cloud-common.js` after common edits.

**Spec:** `docs/superpowers/specs/2026-07-31-lobby-checkin-rewards-design.md`

## Global Constraints

- Day/month boundary: Asia/Shanghai (UTC+8).
- Rewards write directly to `gold` / `materials` / `checkIn.makeupCards` — not mail.
- Daily grant auto on sign/makeup; milestones `1|3|7|15|20` require manual claim.
- Monthly cumulative: miss a day does not clear `signedDays`; month change clears signed/claimed, keeps `makeupCards`.
- Client `_busy` on check-in actions; no enum — use `as const` / string unions.
- After editing `cloudfunctions/common/**`, run `node scripts/sync-cloud-common.js`.
- Gameplay changes must sync `specs/260608-pve-destiny-expedition/design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `cloudfunctions/common/pve/PveCheckIn.js` | Tables, state normalize/rollover, pure apply + DB wrappers |
| `cloudfunctions/common/__tests__/PveCheckIn.test.js` | Cloud unit tests for rules/rewards |
| `cloudfunctions/common/pve/PveProfile.js` | Default + normalize `checkIn` |
| `cloudfunctions/pve/index.js` | `action: 'checkIn'` router |
| `scripts/sync-cloud-common.js` | Add `pve/PveCheckIn.js` to copy list |
| `cloudfunctions/common/admin/AdminConstants.js` | `makeupCards` resource type |
| `cloudfunctions/common/admin/AdminToolService.js` | adjustResources for makeupCards |
| `gm-web/src/main.ts` + `types.ts` | GM dropdown for 补签卡 |
| `assets/scripts/network/PveService.ts` | Client API types + `checkIn*` calls |
| `assets/scripts/pve/core/PveProgressionTypes.ts` | `checkIn` on profile type |
| `assets/scripts/pve/views/CheckInView.ts` | Calendar + milestone UI |
| `assets/scripts/lobby/PveLobbyController.ts` | Entry, red dot, wire actions |
| `specs/260608-pve-destiny-expedition/design.md` | Play rules sync |
| `PROJECT_NAVIGATION.md` / `CALL_FLOW.md` | Entry + call chain |

---

### Task 1: Pure check-in logic + failing tests

**Files:**
- Create: `cloudfunctions/common/pve/PveCheckIn.js`
- Create: `cloudfunctions/common/__tests__/PveCheckIn.test.js`
- Modify: `scripts/sync-cloud-common.js` (add `'pve/PveCheckIn.js'` next to `PveMailService.js`)

**Interfaces:**
- Produces:
  - `MILESTONES = [1, 3, 7, 15, 20]`
  - `dailyRewardForDay(day: number): { gold?, quenchSand?, fusionCore?, voidHide?, makeupCards? }`
  - `milestoneReward(days: number):` same shape
  - `normalizeCheckIn(value, nowMs): { monthKey, signedDays, claimedMilestones, makeupCards }`
  - `shanghaiCalendar(nowMs): { monthKey: string, day: number, daysInMonth: number }`
  - `applySignToday(profile, nowMs) -> { profile, gained }`
  - `applyMakeup(profile, day, nowMs) -> { profile, gained }`
  - `applyClaimMilestone(profile, days, nowMs) -> { profile, gained }`
  - `buildState(profile, nowMs) ->` client-facing state object
  - `hasCheckInRedDot(state) -> boolean`

- [ ] **Step 1: Write failing tests**

Create `cloudfunctions/common/__tests__/PveCheckIn.test.js`:

```js
const { createDefaultProfile } = require('../pve/PveProfile');
const {
  dailyRewardForDay,
  milestoneReward,
  applySignToday,
  applyMakeup,
  applyClaimMilestone,
  normalizeCheckIn,
  shanghaiCalendar,
} = require('../pve/PveCheckIn');

/** Fixed: 2026-07-15 12:00 Asia/Shanghai = 2026-07-15 04:00 UTC */
const NOW = Date.UTC(2026, 6, 15, 4, 0, 0);

function baseProfile(extra = {}) {
  const p = createDefaultProfile(NOW);
  return {
    ...p,
    gold: 100,
    materials: { quenchSand: 0, fusionCore: 0, voidHide: 0 },
    checkIn: normalizeCheckIn({
      monthKey: '2026-07',
      signedDays: [],
      claimedMilestones: [],
      makeupCards: 0,
    }, NOW),
    ...extra,
  };
}

describe('PveCheckIn rewards', () => {
  test('7-day cycle: day 7/14/28 give voidHide', () => {
    expect(dailyRewardForDay(7)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(14)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(28)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(6)).toEqual({ fusionCore: 1 });
    expect(dailyRewardForDay(1)).toEqual({ gold: 30 });
  });

  test('milestone 7 includes makeup card', () => {
    expect(milestoneReward(7)).toEqual({ gold: 100, makeupCards: 1 });
  });
});

describe('PveCheckIn sign / makeup / claim', () => {
  test('sign today grants daily and marks day', () => {
    const { profile, gained } = applySignToday(baseProfile(), NOW);
    expect(gained).toEqual(dailyRewardForDay(15));
    expect(profile.checkIn.signedDays).toContain(15);
    expect(profile.gold).toBe(100 + (gained.gold || 0));
  });

  test('double sign fails', () => {
    const once = applySignToday(baseProfile(), NOW).profile;
    expect(() => applySignToday(once, NOW)).toThrow(/已签/);
  });

  test('month rollover clears signed/claimed keeps cards', () => {
    const august = Date.UTC(2026, 7, 1, 4, 0, 0); // 2026-08-01 12:00 CST
    const p = baseProfile({
      checkIn: {
        monthKey: '2026-07',
        signedDays: [1, 2, 3],
        claimedMilestones: [1, 3],
        makeupCards: 2,
      },
    });
    const next = normalizeCheckIn(p.checkIn, august);
    expect(next.monthKey).toBe('2026-08');
    expect(next.signedDays).toEqual([]);
    expect(next.claimedMilestones).toEqual([]);
    expect(next.makeupCards).toBe(2);
  });

  test('makeup spends card and grants that day reward', () => {
    const p = baseProfile({
      checkIn: normalizeCheckIn({
        monthKey: '2026-07',
        signedDays: [15],
        claimedMilestones: [],
        makeupCards: 1,
      }, NOW),
    });
    const { profile, gained } = applyMakeup(p, 10, NOW);
    expect(gained).toEqual(dailyRewardForDay(10));
    expect(profile.checkIn.makeupCards).toBe(0);
    expect(profile.checkIn.signedDays).toEqual(expect.arrayContaining([10, 15]));
  });

  test('makeup without card fails', () => {
    expect(() => applyMakeup(baseProfile(), 10, NOW)).toThrow(/补签卡/);
  });

  test('claim milestone 7 once; second fails', () => {
    let p = baseProfile({
      checkIn: normalizeCheckIn({
        monthKey: '2026-07',
        signedDays: [1, 2, 3, 4, 5, 6, 7],
        claimedMilestones: [],
        makeupCards: 0,
      }, NOW),
    });
    const first = applyClaimMilestone(p, 7, NOW);
    expect(first.gained).toEqual({ gold: 100, makeupCards: 1 });
    expect(first.profile.checkIn.makeupCards).toBe(1);
    expect(() => applyClaimMilestone(first.profile, 7, NOW)).toThrow(/已领/);
  });

  test('claim before reach fails', () => {
    expect(() => applyClaimMilestone(baseProfile(), 3, NOW)).toThrow(/未达标|未达到/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd cloudfunctions/common && npm test -- --testPathPattern=PveCheckIn
```

Expected: cannot find module `../pve/PveCheckIn` (or similar).

- [ ] **Step 3: Implement `PveCheckIn.js` (pure, no DB yet)**

```js
const MILESTONES = [1, 3, 7, 15, 20];

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function shanghaiCalendar(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day, monthKey, daysInMonth };
}

function dailyRewardForDay(day) {
  const rem = day % 7;
  if (rem === 1) return { gold: 30 };
  if (rem === 2) return { quenchSand: 2 };
  if (rem === 3) return { gold: 40 };
  if (rem === 4) return { quenchSand: 3 };
  if (rem === 5) return { gold: 50, quenchSand: 1 };
  if (rem === 6) return { fusionCore: 1 };
  return { gold: 60, voidHide: 1 }; // rem === 0
}

function milestoneReward(days) {
  if (days === 1) return { gold: 50 };
  if (days === 3) return { quenchSand: 3 };
  if (days === 7) return { gold: 100, makeupCards: 1 };
  if (days === 15) return { quenchSand: 5, fusionCore: 1 };
  if (days === 20) return { gold: 200, voidHide: 2, fusionCore: 1 };
  fail('PVE_MILESTONE_NOT_REACHED', '无效累计档位');
}

function emptyCheckIn(monthKey) {
  return { monthKey, signedDays: [], claimedMilestones: [], makeupCards: 0 };
}

function normalizeCheckIn(value, nowMs = Date.now()) {
  const { monthKey } = shanghaiCalendar(nowMs);
  const src = value && typeof value === 'object' ? value : {};
  const cards = Number.isInteger(src.makeupCards) && src.makeupCards >= 0 ? src.makeupCards : 0;
  if (src.monthKey !== monthKey) {
    return { ...emptyCheckIn(monthKey), makeupCards: cards };
  }
  const signedDays = Array.isArray(src.signedDays)
    ? [...new Set(src.signedDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b)
    : [];
  const claimedMilestones = Array.isArray(src.claimedMilestones)
    ? [...new Set(src.claimedMilestones.filter((d) => MILESTONES.includes(d)))].sort((a, b) => a - b)
    : [];
  return { monthKey, signedDays, claimedMilestones, makeupCards: cards };
}

function normalizeMaterials(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    quenchSand: Number.isInteger(src.quenchSand) && src.quenchSand >= 0 ? src.quenchSand : 0,
    fusionCore: Number.isInteger(src.fusionCore) && src.fusionCore >= 0 ? src.fusionCore : 0,
    voidHide: Number.isInteger(src.voidHide) && src.voidHide >= 0 ? src.voidHide : 0,
  };
}

function applyGrant(profile, grant, nowMs) {
  const materials = normalizeMaterials(profile.materials);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const next = {
    ...profile,
    gold: (profile.gold || 0) + (grant.gold || 0),
    materials: {
      quenchSand: materials.quenchSand + (grant.quenchSand || 0),
      fusionCore: materials.fusionCore + (grant.fusionCore || 0),
      voidHide: materials.voidHide + (grant.voidHide || 0),
    },
    checkIn: {
      ...checkIn,
      makeupCards: checkIn.makeupCards + (grant.makeupCards || 0),
    },
    updatedAt: nowMs,
  };
  return next;
}

function applySignToday(profile, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  if (checkIn.signedDays.includes(cal.day)) {
    fail('PVE_CHECKIN_ALREADY_SIGNED', '今日已签到');
  }
  const gained = dailyRewardForDay(cal.day);
  let next = applyGrant({ ...profile, checkIn }, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      signedDays: [...next.checkIn.signedDays, cal.day].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function applyMakeup(profile, day, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const target = Number(day);
  if (!Number.isInteger(target) || target < 1 || target > cal.daysInMonth || target >= cal.day) {
    fail('PVE_CHECKIN_INVALID_DAY', '补签日期无效');
  }
  if (checkIn.signedDays.includes(target)) {
    fail('PVE_CHECKIN_ALREADY_SIGNED', '该日已签到');
  }
  if (checkIn.makeupCards < 1) {
    fail('PVE_MAKEUP_CARD_NOT_ENOUGH', '补签卡不足');
  }
  const gained = dailyRewardForDay(target);
  let next = applyGrant({
    ...profile,
    checkIn: { ...checkIn, makeupCards: checkIn.makeupCards - 1 },
  }, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      signedDays: [...next.checkIn.signedDays, target].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function applyClaimMilestone(profile, days, nowMs = Date.now()) {
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const target = Number(days);
  if (!MILESTONES.includes(target)) {
    fail('PVE_MILESTONE_NOT_REACHED', '无效累计档位');
  }
  if (checkIn.signedDays.length < target) {
    fail('PVE_MILESTONE_NOT_REACHED', '累计签到未达标');
  }
  if (checkIn.claimedMilestones.includes(target)) {
    fail('PVE_MILESTONE_ALREADY_CLAIMED', '该累计奖励已领取');
  }
  const gained = milestoneReward(target);
  let next = applyGrant(profile, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      claimedMilestones: [...next.checkIn.claimedMilestones, target].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function buildState(profile, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const calendar = [];
  for (let d = 1; d <= cal.daysInMonth; d += 1) {
    calendar.push({
      day: d,
      reward: dailyRewardForDay(d),
      signed: checkIn.signedDays.includes(d),
      canMakeup: d < cal.day && !checkIn.signedDays.includes(d),
    });
  }
  const claimableMilestones = MILESTONES.filter(
    (m) => checkIn.signedDays.length >= m && !checkIn.claimedMilestones.includes(m),
  );
  return {
    monthKey: checkIn.monthKey,
    today: cal.day,
    signedDays: checkIn.signedDays,
    claimedMilestones: checkIn.claimedMilestones,
    makeupCards: checkIn.makeupCards,
    canSignToday: !checkIn.signedDays.includes(cal.day),
    claimableMilestones,
    milestones: MILESTONES.map((days) => ({
      days,
      reward: milestoneReward(days),
      reached: checkIn.signedDays.length >= days,
      claimed: checkIn.claimedMilestones.includes(days),
    })),
    calendar,
  };
}

function hasCheckInRedDot(state) {
  return Boolean(state.canSignToday || (state.claimableMilestones && state.claimableMilestones.length > 0));
}

module.exports = {
  MILESTONES,
  shanghaiCalendar,
  dailyRewardForDay,
  milestoneReward,
  normalizeCheckIn,
  applySignToday,
  applyMakeup,
  applyClaimMilestone,
  buildState,
  hasCheckInRedDot,
};
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cd cloudfunctions/common && npm test -- --testPathPattern=PveCheckIn
```

- [ ] **Step 5: Add sync entry + commit**

In `scripts/sync-cloud-common.js` `COPY_SUBDIR_FILES`, add `'pve/PveCheckIn.js'` after `'pve/PveMailService.js'`.

```bash
git add cloudfunctions/common/pve/PveCheckIn.js cloudfunctions/common/__tests__/PveCheckIn.test.js scripts/sync-cloud-common.js
git commit -m "feat(pve): add check-in reward tables and pure apply logic"
```

---

### Task 2: Profile normalize + cloud persistence API

**Files:**
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Modify: `cloudfunctions/common/pve/PveCheckIn.js` (add DB wrappers)
- Modify: `cloudfunctions/pve/index.js`
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts`

**Interfaces:**
- Consumes: Task 1 pure apply functions
- Produces: `handleCheckInAction(user, { action, day?, days? }, nowMs)` returning `{ checkIn, gained?, profile }`

- [ ] **Step 1: Extend profile default + normalize**

In `createDefaultProfile`, add:

```js
checkIn: { monthKey: /* from shanghai at now — or empty and let normalize fill */, signedDays: [], claimedMilestones: [], makeupCards: 0 },
```

Prefer requiring `normalizeCheckIn` from `./PveCheckIn` inside `normalizeProfile`:

```js
const { normalizeCheckIn } = require('./PveCheckIn');
// inside normalizeProfile return:
checkIn: normalizeCheckIn(value.checkIn, now),
```

Avoid circular requires: if `PveCheckIn` imports `PveProfile`, keep grant helpers free of profile module import (already true). `PveProfile` may require `PveCheckIn` only for `normalizeCheckIn`.

Also update `resetCampInventory` / `resetExpeditionProgress` behavior:
- `resetExpeditionProgress` already returns full default (includes fresh checkIn) — OK.
- `resetCampInventory`: **keep** `checkIn` unchanged (sign-in is not camp bag).

- [ ] **Step 2: Add types on client**

In `PveProgressionTypes.ts`:

```ts
export interface PveCheckInState {
  monthKey: string;
  signedDays: number[];
  claimedMilestones: number[];
  makeupCards: number;
}

// on PvePlayerProfile:
checkIn?: PveCheckInState;
```

- [ ] **Step 3: Persist wrappers in `PveCheckIn.js`**

```js
const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, serverDate } = require('../db');
const { normalizeProfile } = require('./PveProfile');

async function handleCheckInAction(user, request = {}, nowMs = Date.now()) {
  const latest = await getUserById(user.id);
  if (!latest) {
    fail('USER_NOT_FOUND', '用户不存在');
  }
  const action = String(request.action || 'GET_STATE');
  let profile = normalizeProfile(latest.pveProfile, nowMs);
  let gained = null;

  if (action === 'GET_STATE') {
    // no-op beyond normalize/rollover persist below
  } else if (action === 'SIGN_TODAY') {
    ({ profile, gained } = applySignToday(profile, nowMs));
  } else if (action === 'MAKEUP') {
    ({ profile, gained } = applyMakeup(profile, request.day, nowMs));
  } else if (action === 'CLAIM_MILESTONE') {
    ({ profile, gained } = applyClaimMilestone(profile, request.days, nowMs));
  } else {
    fail('UNKNOWN_ACTION', `未知 checkIn action: ${action}`);
  }

  await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({
    data: { pveProfile: profile, updatedDate: serverDate() },
  });

  const checkIn = buildState(profile, nowMs);
  return {
    checkIn,
    gained,
    profile: {
      gold: profile.gold,
      materials: profile.materials,
      checkIn: profile.checkIn,
    },
    redDot: hasCheckInRedDot(checkIn),
  };
}

module.exports.handleCheckInAction = handleCheckInAction;
```

Note: For `GET_STATE`, still persist if month rollover changed `checkIn` so clients see consistent monthKey.

- [ ] **Step 4: Wire `pve/index.js`**

```js
const { handleCheckInAction } = require('./common/pve/PveCheckIn');
// ...
if (action === 'checkIn') {
  const result = await handleCheckInAction(user, event.request || {
    action: event.checkInAction,
    day: event.day,
    days: event.days,
  });
  return { ok: true, ...result };
}
```

Prefer single payload shape: `{ action: 'checkIn', request: { action: 'SIGN_TODAY' } }`.

- [ ] **Step 5: Run cloud tests + sync**

```bash
cd cloudfunctions/common && npm test -- --testPathPattern=PveCheckIn
node scripts/sync-cloud-common.js
```

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/common/pve/PveProfile.js cloudfunctions/common/pve/PveCheckIn.js cloudfunctions/pve/index.js assets/scripts/pve/core/PveProgressionTypes.ts
git commit -m "feat(pve): persist check-in state and expose checkIn cloud action"
```

---

### Task 3: Client service + CheckInView + lobby entry

**Files:**
- Modify: `assets/scripts/network/PveService.ts`
- Create: `assets/scripts/pve/views/CheckInView.ts`
- Modify: `assets/scripts/lobby/PveLobbyController.ts`

**Interfaces:**
- Consumes: cloud `checkIn` response shape from Task 2
- Produces: lobby entry + modal UX per spec §UI

- [ ] **Step 1: Add `PveService` APIs**

```ts
export type CheckInReward = {
  gold?: number;
  quenchSand?: number;
  fusionCore?: number;
  voidHide?: number;
  makeupCards?: number;
};

export interface CheckInCalendarDay {
  day: number;
  reward: CheckInReward;
  signed: boolean;
  canMakeup: boolean;
}

export interface CheckInMilestoneRow {
  days: number;
  reward: CheckInReward;
  reached: boolean;
  claimed: boolean;
}

export interface CheckInState {
  monthKey: string;
  today: number;
  signedDays: number[];
  claimedMilestones: number[];
  makeupCards: number;
  canSignToday: boolean;
  claimableMilestones: number[];
  milestones: CheckInMilestoneRow[];
  calendar: CheckInCalendarDay[];
}

export interface CheckInResponse extends CloudOk {
  checkIn: CheckInState;
  gained?: CheckInReward | null;
  profile?: {
    gold?: number;
    materials?: { quenchSand: number; fusionCore: number; voidHide: number };
    checkIn?: PveCheckInState;
  };
  redDot?: boolean;
}

export async function getCheckInState(): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'GET_STATE' },
    }),
    'PVE_CHECKIN_STATE_FAILED',
  );
}

export async function signCheckInToday(): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'SIGN_TODAY' },
    }),
    'PVE_CHECKIN_SIGN_FAILED',
  );
}

export async function makeupCheckIn(day: number): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'MAKEUP', day },
    }),
    'PVE_CHECKIN_MAKEUP_FAILED',
  );
}

export async function claimCheckInMilestone(days: number): Promise<CheckInResponse> {
  return ensureOk(
    await callFunction<CheckInResponse>('pve', {
      action: 'checkIn',
      request: { action: 'CLAIM_MILESTONE', days },
    }),
    'PVE_CHECKIN_MILESTONE_FAILED',
  );
}
```

Import/export `PveCheckInState` from progression types or redefine lightly in service file to avoid cycles — prefer import type from `PveProgressionTypes`.

- [ ] **Step 2: Build `CheckInView.ts`**

Mirror `MailView` overlay pattern (`makeFlatButton` / `makeLabel` from `pveUiKit`):

- Props/callbacks: `onClose`, `onSign`, `onMakeup(day)`, `onClaimMilestone(days)`
- `setState(state: CheckInState)` rebuilds:
  - Title `本月签到` + `补签卡 ×N`
  - Calendar grid ~7 columns (日–六); cell shows day number + compact reward text; selected past unsigned day highlights
  - Primary button: if today unsigned →「签到」; else if selection is makeup target →「补签」; else disabled
  - Milestone row: five nodes; claimable shows「领取」
- Hide ad button node with `active = false` (placeholder for later)
- `destroy()` removes overlay

Keep layout pragmatic (Graphics panels + Labels); no new art required. Icon path optional: try `pve/lobby/icon_checkin` via lobby icon loader if easy; else text-only entry.

- [ ] **Step 3: Lobby entry beside mail**

In `PveLobbyController`:

1. Add `_buildCheckInEntry` similar to `_buildMailEntry`, place **to the right of mail** (same Y, `entryX + MAIL_W + gap`), label「签到」, badge host for red dot (dot only, no count, or `!`).
2. On lobby ready / after profile load: `getCheckInState()` → `_setCheckInBadge(res.redDot)`.
3. `_showCheckIn()` opens `CheckInView`, loads state, wires:
   - sign → `signCheckInToday`
   - makeup → `makeupCheckIn(day)`
   - claim → `claimCheckInMilestone(days)`
4. On success: `view.setState(res.checkIn)`; update `_stardustLabel` from `res.profile.gold` if present; refresh badge from `res.redDot`; toast gained summary (reuse existing toast if available).
5. Guard with `_checkInBusy`.

- [ ] **Step 4: Manual smoke checklist (editor / wechat)**

1. Open lobby → see 签到 next to 邮箱.  
2. Open → calendar shows today highlight → 签到 → day「已签」, gold/materials update.  
3. Claim milestone 1 after first sign.  
4. With GM/card (or forced profile in test env) makeup a past day.

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/network/PveService.ts assets/scripts/pve/views/CheckInView.ts assets/scripts/lobby/PveLobbyController.ts
git commit -m "feat(pve): lobby check-in UI and cloud client wiring"
```

---

### Task 4: GM makeupCards + docs sync

**Files:**
- Modify: `cloudfunctions/common/admin/AdminConstants.js`
- Modify: `cloudfunctions/common/admin/AdminToolService.js`
- Modify: `gm-web/src/types.ts` (ResourceType union)
- Modify: `gm-web/src/main.ts` (select option + labels; show makeupCards on player if exposed)
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `PROJECT_NAVIGATION.md`
- Modify: `CALL_FLOW.md`
- Optional test: extend admin resource test if one exists

- [ ] **Step 1: Admin resource type**

```js
// AdminConstants.js
const RESOURCE_TYPES = {
  STARDUST: 'stardust',
  STAMINA: 'stamina',
  MAKEUP_CARDS: 'makeupCards',
};
const RESOURCE_LIMITS = {
  [RESOURCE_TYPES.STARDUST]: 999999,
  [RESOURCE_TYPES.STAMINA]: 200,
  [RESOURCE_TYPES.MAKEUP_CARDS]: 999,
};
```

In `adjustResourcesAction`, add branch:

```js
} else if (resourceType === RESOURCE_TYPES.MAKEUP_CARDS) {
  const profile = normalizeProfile(user.pveProfile);
  const checkIn = profile.checkIn;
  const currentValue = Number(checkIn.makeupCards || 0);
  const nextValue = currentValue + amount;
  if (nextValue < 0) { /* GM_RESOURCE_NEGATIVE_NOT_ALLOWED */ }
  const nextProfile = {
    ...profile,
    checkIn: { ...checkIn, makeupCards: nextValue },
    updatedAt: Date.now(),
  };
  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: { pveProfile: nextProfile, updatedDate: serverDate() },
  });
  before = { makeupCards: currentValue };
  after = { makeupCards: nextValue };
}
```

Ensure `getPlayer` payload includes `makeupCards: profile.checkIn?.makeupCards ?? 0` if player detail is shown.

- [ ] **Step 2: GM web option**

Add `makeupCards` to `ResourceType`, label「补签卡」, `<option value="makeupCards">`.

- [ ] **Step 3: Sync cloud common + run admin/check-in tests**

```bash
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test -- --testPathPattern='PveCheckIn|Admin'
```

- [ ] **Step 4: Docs**

Add a short section to `specs/260608-pve-destiny-expedition/design.md` under lobby/meta (near 邮箱):

- 大厅签到：月累计；每日 7 日循环奖；里程碑 1/3/7/15/20 手动领；补签卡；权威 `PveCheckIn`；细则见 `docs/superpowers/specs/2026-07-31-lobby-checkin-rewards-design.md`。

`PROJECT_NAVIGATION.md` 大厅表增加签到行。  
`CALL_FLOW.md` 增加签到调用链（对齐邮箱小节）。

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/common/admin/AdminConstants.js cloudfunctions/common/admin/AdminToolService.js gm-web/src/types.ts gm-web/src/main.ts specs/260608-pve-destiny-expedition/design.md PROJECT_NAVIGATION.md CALL_FLOW.md
git commit -m "feat(pve): GM makeup cards and check-in design sync"
```

---

## Self-review

| Spec requirement | Task |
|------------------|------|
| Monthly cumulative + rollover keeps cards | 1 |
| 7-day daily table + voidHide on 7/14/21/28 | 1 |
| Milestones + manual claim + day7 makeup card | 1 |
| Makeup past days with card | 1–3 |
| Cloud authority + profile.checkIn | 2 |
| Lobby entry near mail + red dot | 3 |
| CheckInView calendar + milestones | 3 |
| Reward pool includes voidHide | 1 |
| GM makeup cards (+ ad placeholder hidden) | 3–4 |
| design.md / nav / call flow | 4 |
| No mail attachments for materials | honored (direct grant) |

No TBD placeholders left. Names consistent: `handleCheckInAction`, `buildState`, `CheckInState`, actions `GET_STATE|SIGN_TODAY|MAKEUP|CLAIM_MILESTONE`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-lobby-checkin-rewards.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
