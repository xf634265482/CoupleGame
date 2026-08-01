# GM Unlock All Partners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GM `unlockAllPartners` that sets all six partners `unlocked: true` without switching to `legacy`, preserves level/exp/stage, and stays idempotent with progressive clear unlocks; reset expedition continues to restore locks.

**Architecture:** Pure helper `unlockAllPartnersOnProfile` in `PvePartner.js`; admin action writes profile via `updateUserPveProfile`; gm-web button beside reset ops. Progressive `applyPartnerUnlocks` already skips unlocked partners — add a regression test.

**Tech Stack:** `cloudfunctions/common` (jest), gm-web Vite TS, design.md sync.

**Spec:** `docs/superpowers/specs/2026-08-01-gm-unlock-all-partners-design.md`

## Global Constraints

- Only flip `unlocked`; keep level / exp / evolutionStage
- Do **not** set `partnerUnlockScheme` to `legacy`
- If `equippedPartnerId` is null, set to `MOBILITY`
- `resetExpedition` unchanged (`createDefaultProfile`)
- Edit only `cloudfunctions/common/**` then `node scripts/sync-cloud-common.js`
- Admin actions require `reason`

## File Structure

| File | Role |
|------|------|
| Modify `cloudfunctions/common/pve/PvePartner.js` | `unlockAllPartnersOnProfile` |
| Modify `cloudfunctions/common/__tests__/PvePartner.test.js` | Unlock + idempotent clear unlock |
| Modify `cloudfunctions/common/admin/AdminConstants.js` | `UNLOCK_ALL_PARTNERS` |
| Modify `cloudfunctions/common/admin/AdminToolService.js` | Action + switch |
| Modify `gm-web/src/types.ts` | AdminAction union |
| Modify `gm-web/src/main.ts` | Button + handler |
| Modify `specs/260608-pve-destiny-expedition/design.md` | §7.1 one line |

---

### Task 1: Pure helper + tests + admin action

**Files:**
- Modify: `cloudfunctions/common/pve/PvePartner.js`
- Modify: `cloudfunctions/common/__tests__/PvePartner.test.js`
- Modify: `cloudfunctions/common/admin/AdminConstants.js`
- Modify: `cloudfunctions/common/admin/AdminToolService.js`

**Interfaces:**
- Produces: `unlockAllPartnersOnProfile(profile) -> profile`
- Admin: `unlockAllPartners` payload `{ userId|openId, reason }` → `{ ok, player }`

- [ ] **Step 1: Failing tests**

Append to `PvePartner.test.js`:

```js
const { unlockAllPartnersOnProfile } = require('../pve/PvePartner');

test('unlockAllPartners opens all and keeps progressive + progress', () => {
  let p = normalizeProfile({ version: 1 });
  p = grantStarterPartnerOnProfile(p).profile;
  p.partners.MOBILITY.level = 8;
  p.partners.MOBILITY.evolutionStage = 2;
  p = unlockAllPartnersOnProfile(p);
  expect(p.partnerUnlockScheme).toBe('progressive');
  for (const id of ['MOBILITY', 'GUARD', 'BREAKER', 'CONTROL', 'ANIMA', 'HEAL']) {
    expect(p.partners[id].unlocked).toBe(true);
  }
  expect(p.partners.MOBILITY.level).toBe(8);
  expect(p.partners.MOBILITY.evolutionStage).toBe(2);
  expect(p.equippedPartnerId).toBe('MOBILITY');
});

test('unlockAllPartners then clear unlock is idempotent', () => {
  let p = unlockAllPartnersOnProfile(normalizeProfile({ version: 1 }));
  const { profile, newlyUnlockedPartnerIds } = applyPartnerUnlocksOnProfile(p, 17);
  expect(newlyUnlockedPartnerIds).toEqual([]);
  expect(profile.partners.ANIMA.unlocked).toBe(true);
  expect(profile.partnerUnlockScheme).toBe('progressive');
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd cloudfunctions/common && npm test -- PvePartner.test.js
```

Expected: FAIL (`unlockAllPartnersOnProfile` missing)

- [ ] **Step 3: Implement helper in `PvePartner.js`**

```js
function unlockAllPartnersOnProfile(profile) {
  const { partners, equippedPartnerId, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    {
      partnerUnlockScheme: profile.partnerUnlockScheme || 'progressive',
      highestClearedFloor: profile.highestClearedFloor,
    },
  );
  const nextPartners = {};
  for (const id of PARTNER_IDS) {
    const cur = partners[id] || lockedProgress();
    nextPartners[id] = { ...cur, unlocked: true };
  }
  const nextEquipped = equippedPartnerId && nextPartners[equippedPartnerId]?.unlocked
    ? equippedPartnerId
    : 'MOBILITY';
  return {
    ...profile,
    partners: nextPartners,
    equippedPartnerId: nextEquipped,
    // Keep scheme as-is; force progressive if somehow missing after normalize
    partnerUnlockScheme: partnerUnlockScheme === 'legacy' ? 'legacy' : 'progressive',
  };
}
```

**Important:** Spec says do not switch *to* legacy. If input was already `legacy`, leaving it as `legacy` is OK; if input was progressive/missing, keep `progressive`. The ternary above preserves existing legacy accounts without converting progressive GM unlocks into legacy.

Export `unlockAllPartnersOnProfile` from `module.exports`.

- [ ] **Step 4: Admin constants + action**

In `AdminConstants.js` add:

```js
UNLOCK_ALL_PARTNERS: 'unlockAllPartners',
```

In `AdminToolService.js`:

```js
const { unlockAllPartnersOnProfile } = require('../pve/PvePartner');

async function unlockAllPartnersAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  const beforeProfile = normalizeProfile(user.pveProfile);
  const before = {
    partnerUnlockScheme: beforeProfile.partnerUnlockScheme,
    unlockedCount: Object.values(beforeProfile.partners || {})
      .filter((p) => p && p.unlocked === true).length,
    equippedPartnerId: beforeProfile.equippedPartnerId,
  };
  const nextProfile = {
    ...unlockAllPartnersOnProfile(beforeProfile),
    updatedAt: Date.now(),
  };
  await updateUserPveProfile(user._id, nextProfile, { updatedDate: serverDate() });
  const userAfter = await getUserById(user.id);
  const afterProfile = normalizeProfile(userAfter?.pveProfile);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.UNLOCK_ALL_PARTNERS,
    payload: {},
    before,
    after: {
      partnerUnlockScheme: afterProfile.partnerUnlockScheme,
      unlockedCount: Object.values(afterProfile.partners || {})
        .filter((p) => p && p.unlocked === true).length,
      equippedPartnerId: afterProfile.equippedPartnerId,
    },
    reason,
    requestSource,
    success: true,
  });
  return { ok: true, player: toPlayerView(userAfter) };
}
```

Register in `handleAdminAction` switch:

```js
case ADMIN_ACTIONS.UNLOCK_ALL_PARTNERS:
  return unlockAllPartnersAction(account, payload, requestSource);
```

- [ ] **Step 5: Tests PASS + sync + commit**

```bash
cd cloudfunctions/common && npm test -- PvePartner.test.js
node scripts/sync-cloud-common.js
git add cloudfunctions/common/pve/PvePartner.js cloudfunctions/common/__tests__/PvePartner.test.js cloudfunctions/common/admin/AdminConstants.js cloudfunctions/common/admin/AdminToolService.js
# include synced copies under cloudfunctions/*/common/ if tracked dirty
git commit -m "feat(gm): unlock all partners without switching to legacy"
```

---

### Task 2: GM Web + design.md

**Files:**
- Modify: `gm-web/src/types.ts`
- Modify: `gm-web/src/main.ts`
- Modify: `specs/260608-pve-destiny-expedition/design.md`

- [ ] **Step 1: types**

```ts
| 'unlockAllPartners'
```

- [ ] **Step 2: UI**

In `ADMIN_ACTION_LABELS` add `unlockAllPartners: '解锁全部伙伴'`.

Near reset buttons (or a small “伙伴” panel above resets), add:

```html
<button id="unlockAllPartnersBtn" ${currentPlayer ? '' : 'disabled'}>解锁全部伙伴</button>
```

Bind click (reuse `resetForm.reason` or a dedicated reason — **钉死：复用 `resetForm.reason`**，与重置操作同一原因框):

```ts
document.querySelector<HTMLButtonElement>('#unlockAllPartnersBtn')?.addEventListener('click', async () => {
  if (!currentPlayer) return setFeedback('请先查询玩家', 'error');
  if (!resetForm.reason.trim()) return setFeedback('请填写操作原因', 'error');
  if (!window.confirm(`确认解锁 ${currentPlayer.nickname} 的全部伙伴？\n仅开锁，不改等级/进化；重置远征后仍会恢复锁定。`)) return;
  const userId = currentPlayer.userId;
  await withTool('unlockAllPartners', {
    userId,
    reason: resetForm.reason.trim(),
  }, async () => {
    await fetchPlayer(userId);
    setFeedback('已解锁全部伙伴', 'info');
  }, false);
});
```

- [ ] **Step 3: design.md §7.1**

After progressive unlock bullet, add:

```markdown
- **GM**：`unlockAllPartners` 可将六只伙伴全部开锁（保留养成进度，不切 `legacy`）；通关条件再达成时幂等跳过；`resetExpedition` 清档后仍回全锁按条件解锁。
```

- [ ] **Step 4: Commit**

```bash
git add gm-web/src/types.ts gm-web/src/main.ts specs/260608-pve-destiny-expedition/design.md
git commit -m "feat(gm-web): unlock-all-partners button and docs"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| unlock flags only + keep progressive | 1 |
| equip MOBILITY if none | 1 |
| idempotent clear unlock | 1 |
| admin reason + log | 1 |
| gm-web button | 2 |
| reset expedition unchanged | (no code; doc note) |
| design.md | 2 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-gm-unlock-all-partners.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task  
2. **Inline Execution** — this session continuous  

Which approach?
