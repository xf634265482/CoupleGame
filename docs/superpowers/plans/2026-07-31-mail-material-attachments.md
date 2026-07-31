# Mail Material Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend mail attachments so GM can send quenchSand / fusionCore / voidHide / makeupCards (plus existing stardust / stamina); players claim into the correct profile fields.

**Architecture:** Flat attachment `type` strings in `PveMail.js`; claim applies via `normalizeMaterials` / `normalizeCheckIn`. GM Web keeps single-type dropdown. Client `MailView` shows Chinese labels. No Service API shape change beyond accepting new types.

**Tech Stack:** WeChat cloud `cloudfunctions/common` (jest), Cocos lobby `MailView`, gm-web Vite TS.

**Spec:** `docs/superpowers/specs/2026-07-31-mail-material-attachments-design.md`

## Global Constraints

- Attachment types (flat): `stardust` | `stamina` | `quenchSand` | `fusionCore` | `voidHide` | `makeupCards`
- Amount: positive integer; default cap `999999`; **makeupCards single attachment amount ≤ 999**
- GM UI: one attachment type + amount per send (no multi-attach)
- Only edit `cloudfunctions/common/**` then `node scripts/sync-cloud-common.js`
- Sync `specs/260608-pve-destiny-expedition/design.md` mailbox bullet
- Do **not** add materials to GM `adjustResources` in this plan

## File Structure

| File | Role |
|------|------|
| Modify `cloudfunctions/common/pve/PveMail.js` | Whitelist + apply materials / makeupCards |
| Modify `cloudfunctions/common/__tests__/PveMail.test.js` | New type + apply tests |
| Modify `assets/scripts/network/PveService.ts` | Widen `MailAttachmentType` |
| Modify `assets/scripts/pve/views/MailView.ts` | Attachment summary labels |
| Modify `gm-web/src/types.ts` | `MailAttachmentType` |
| Modify `gm-web/src/main.ts` | Dropdown options + labels for confirm |
| Modify `specs/260608-pve-destiny-expedition/design.md` | Mailbox attachment list |

---

### Task 1: Cloud `PveMail` types + apply + tests

**Files:**
- Modify: `cloudfunctions/common/pve/PveMail.js`
- Modify: `cloudfunctions/common/__tests__/PveMail.test.js`
- Run: `node scripts/sync-cloud-common.js` after implement

**Interfaces:**
- Consumes: `normalizeMaterials` from `./PveCamp`; `normalizeCheckIn` from `./PveCheckIn`; existing stamina helpers
- Produces: expanded `MAIL_ATTACHMENT_TYPES`; `normalizeAttachment` / `applyMailAttachmentsToUserState` support new types

- [ ] **Step 1: Extend failing tests**

Append to `PveMail.test.js`:

```js
  test('accepts material and makeupCards attachments', () => {
    const m = normalizeMailInput({
      title: 't',
      body: 'b',
      attachments: [
        { type: 'quenchSand', amount: 2 },
        { type: 'fusionCore', amount: 1 },
        { type: 'voidHide', amount: 3 },
        { type: 'makeupCards', amount: 1 },
      ],
    });
    expect(m.attachments).toEqual([
      { type: 'quenchSand', amount: 2 },
      { type: 'fusionCore', amount: 1 },
      { type: 'voidHide', amount: 3 },
      { type: 'makeupCards', amount: 1 },
    ]);
  });

  test('rejects makeupCards amount over 999', () => {
    expect(() => normalizeMailInput({
      title: 't', body: 'b', attachments: [{ type: 'makeupCards', amount: 1000 }],
    })).toThrow();
  });

  test('apply materials and makeupCards into profile', () => {
    const profile = createDefaultProfile(1);
    const next = applyMailAttachmentsToUserState(
      { profile, stamina: 10, staminaUpdatedAt: 1 },
      [
        { type: 'quenchSand', amount: 5 },
        { type: 'fusionCore', amount: 2 },
        { type: 'voidHide', amount: 4 },
        { type: 'makeupCards', amount: 3 },
      ],
      1000,
    );
    expect(next.profile.materials.quenchSand).toBe(5);
    expect(next.profile.materials.fusionCore).toBe(2);
    expect(next.profile.materials.voidHide).toBe(4);
    expect(next.profile.checkIn.makeupCards).toBe(3);
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd cloudfunctions/common && npm test -- PveMail.test.js`  
Expected: FAIL on new types / apply assertions

- [ ] **Step 3: Implement `PveMail.js`**

Replace attachment constants and helpers with:

```js
const { STAMINA_MAX, resolveStamina } = require('./PveStamina');
const { normalizeMaterials } = require('./PveCamp');
const { normalizeCheckIn } = require('./PveCheckIn');

const MAIL_ATTACHMENT_TYPES = {
  STARDUST: 'stardust',
  STAMINA: 'stamina',
  QUENCH_SAND: 'quenchSand',
  FUSION_CORE: 'fusionCore',
  VOID_HIDE: 'voidHide',
  MAKEUP_CARDS: 'makeupCards',
};

const ALLOWED_ATTACHMENT_TYPES = new Set(Object.values(MAIL_ATTACHMENT_TYPES));

function normalizeAttachment(input) {
  const type = String(input?.type || '').trim();
  const amount = Number(input?.amount);
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件类型不支持');
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件数量必须为正整数');
  }
  const max = type === MAIL_ATTACHMENT_TYPES.MAKEUP_CARDS ? 999 : 999999;
  if (amount > max) {
    fail('PVE_MAIL_ATTACHMENT_INVALID', '附件数量过大');
  }
  return { type, amount };
}

function applyMailAttachmentsToUserState(
  { profile, stamina, staminaUpdatedAt },
  attachments,
  now = Date.now(),
) {
  const list = Array.isArray(attachments) ? attachments : [];
  let nextProfile = { ...profile };
  let gold = Math.max(0, Math.trunc(Number(nextProfile.gold) || 0));
  let materials = normalizeMaterials(nextProfile.materials);
  let checkIn = normalizeCheckIn(nextProfile.checkIn, now);
  const resolved = resolveStamina(stamina, staminaUpdatedAt, now);
  let nextStamina = resolved.stamina;
  let nextUpdatedAt = resolved.updatedAt;

  for (const raw of list) {
    const item = normalizeAttachment(raw);
    if (item.type === MAIL_ATTACHMENT_TYPES.STARDUST) {
      gold += item.amount;
    } else if (item.type === MAIL_ATTACHMENT_TYPES.STAMINA) {
      nextStamina = Math.min(STAMINA_MAX, nextStamina + item.amount);
      nextUpdatedAt = now;
    } else if (item.type === MAIL_ATTACHMENT_TYPES.QUENCH_SAND) {
      materials = { ...materials, quenchSand: materials.quenchSand + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.FUSION_CORE) {
      materials = { ...materials, fusionCore: materials.fusionCore + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.VOID_HIDE) {
      materials = { ...materials, voidHide: materials.voidHide + item.amount };
    } else if (item.type === MAIL_ATTACHMENT_TYPES.MAKEUP_CARDS) {
      checkIn = { ...checkIn, makeupCards: checkIn.makeupCards + item.amount };
    }
  }

  nextProfile = { ...nextProfile, gold, materials, checkIn };
  const after = resolveStamina(nextStamina, nextUpdatedAt, now);
  return {
    profile: nextProfile,
    stamina: after.stamina,
    staminaUpdatedAt: after.updatedAt,
    staminaNextRecoveryAt: after.nextRecoveryAt,
  };
}
```

Keep existing `fail` / `normalizeMailInput` / delete / unread / `buildMailView` unchanged except they already call `normalizeAttachment`.

- [ ] **Step 4: Run tests — PASS + sync**

```bash
cd cloudfunctions/common && npm test -- PveMail.test.js
node scripts/sync-cloud-common.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/common/pve/PveMail.js cloudfunctions/common/__tests__/PveMail.test.js
# after sync, also add synced copies if git tracks them — prefer only common/ if copies are gitignored; otherwise add sync diffs for pve/adminTool common copies as this repo usually tracks them
git commit -m "feat(pve): mail attachments for materials and makeup cards"
```

---

### Task 2: Client labels + GM Web dropdown

**Files:**
- Modify: `assets/scripts/network/PveService.ts` (`MailAttachmentType`)
- Modify: `assets/scripts/pve/views/MailView.ts` (`attachmentSummary`)
- Modify: `gm-web/src/types.ts`
- Modify: `gm-web/src/main.ts`

**Interfaces:**
- Consumes: Task 1 cloud types
- Produces: UI can send/display all six attachment types

- [ ] **Step 1: Widen client type**

In `PveService.ts`:

```ts
export type MailAttachmentType =
  | 'stardust'
  | 'stamina'
  | 'quenchSand'
  | 'fusionCore'
  | 'voidHide'
  | 'makeupCards';
```

- [ ] **Step 2: MailView summary map**

Replace `attachmentSummary` in `MailView.ts`:

```ts
const ATTACH_LABELS: Record<string, string> = {
  stardust: '星尘',
  stamina: '体力',
  quenchSand: '淬星砂',
  fusionCore: '聚星核',
  voidHide: '虚空革',
  makeupCards: '补签卡',
};

function attachmentSummary(mail: MailItem): string {
  if (!mail.attachments.length) return '通知';
  return mail.attachments
    .map((item) => `${ATTACH_LABELS[item.type] || item.type}×${item.amount}`)
    .join(' · ');
}
```

- [ ] **Step 3: GM types + form**

`gm-web/src/types.ts`:

```ts
export type MailAttachmentType =
  | 'none'
  | 'stardust'
  | 'stamina'
  | 'quenchSand'
  | 'fusionCore'
  | 'voidHide'
  | 'makeupCards';
```

In `main.ts`:
- Add labels used by mail confirm (either extend a `MAIL_ATTACHMENT_LABELS` map, or reuse/extend labels so confirm does not fall back to raw English for materials):

```ts
const MAIL_ATTACHMENT_LABELS: Record<Exclude<MailAttachmentType, 'none'>, string> = {
  stardust: '星尘',
  stamina: '体力',
  quenchSand: '淬星砂',
  fusionCore: '聚星核',
  voidHide: '虚空革',
  makeupCards: '补签卡',
};
```

- Expand `<select id="mailAttachmentType">` options for the four new types.
- Change attachments push typing to:

```ts
const attachments: Array<{ type: Exclude<MailAttachmentType, 'none'>; amount: number }> = [];
```

- Confirm string uses `MAIL_ATTACHMENT_LABELS[item.type]` (not `RESOURCE_TYPE_LABELS`, which lacks material keys).
- Client-side: if `attachmentType === 'makeupCards'` and amount > 999, show error before submit.

- [ ] **Step 4: Commit**

```bash
git add assets/scripts/network/PveService.ts assets/scripts/pve/views/MailView.ts gm-web/src/types.ts gm-web/src/main.ts
git commit -m "feat(lobby,gm-web): show and send material mail attachments"
```

---

### Task 3: Docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` (邮箱 bullet ~line 103)
- Optional one-line note in `docs/superpowers/specs/2026-07-28-mail-system-design.md` if still listed as stardust/stamina only

- [ ] **Step 1: Update design.md mailbox bullet**

Replace the attachments sentence with:

```markdown
- **邮箱**：左上头像卡下方入口；集合 `pve_mails`；附件支持星尘（`pveProfile.gold`）、体力、淬星砂 / 聚星核 / 虚空革（`materials.*`）、补签卡（`checkIn.makeupCards`）；纯通知无附件；未领有附件不可删；一键领取全部；不过期；软删；GM 下拉单选一种附件。
```

- [ ] **Step 2: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md
git commit -m "docs(pve): document material and makeup mail attachments"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| Six attachment types + notify | 1–2 |
| Flat type + materials/checkIn apply | 1 |
| makeupCards ≤999 | 1–2 |
| Single-type GM UI | 2 |
| Client labels | 2 |
| design.md | 3 |
| No adjustResources materials | (explicit non-goal) |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-mail-material-attachments.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, task-by-task with checkpoints  

Which approach?
