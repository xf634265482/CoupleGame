# Mail System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大厅邮箱 + 玩家领取星尘/体力/通知；GM 单人与全服发信；清除 PVE/GM 钻石入口，货币统一为星尘。

**Architecture:** `pve_mails` 每人一封文档；`cloudfunctions/common/pve/PveMail.js` 纯逻辑 + `db` 读写；`pve`/`adminTool` 暴露 action；大厅 `MailView` 弹层；GM Web 发信表单。广播 fan-out 写多条同 `batchId`。

**Tech Stack:** 微信云开发云函数（`cloudfunctions/common`）、Cocos 3.8 TS 大厅 UI、gm-web Vite、jest（`cloudfunctions/common/__tests__` + 可选 `test/pve`）。

**Spec:** `docs/superpowers/specs/2026-07-28-mail-system-design.md`

## Global Constraints

- 附件仅 `stardust` / `stamina` 与纯通知；星尘入账 `pveProfile.gold`；无钻石附件。
- 未领且有附件的邮件不可删；领取幂等。
- 第一版不过期；软删 `deleted=true`。
- 只改 `cloudfunctions/common/**` 后必须 `node scripts/sync-cloud-common.js`；新文件加入 `scripts/sync-cloud-common.js` 的 `COPY_SUBDIR_FILES`。
- PVE `core/` 禁止 `import 'cc'`（邮件 UI 在 lobby/views，不进 core）。
- 玩法/系统规则同步 `specs/260608-pve-destiny-expedition/design.md`、`CALL_FLOW.md`、`PROJECT_NAVIGATION.md`。
- 清除 GM/大厅钻石产品入口；不删 `users.diamond` 历史字段。

## File Structure

| File | Role |
|------|------|
| Create `cloudfunctions/common/pve/PveMail.js` | 邮件校验、入账纯函数、列表视图归一化 |
| Create `cloudfunctions/common/__tests__/PveMail.test.js` | 领取/删除/附件规则单测 |
| Modify `cloudfunctions/common/constants.js` | `PVE_MAILS: 'pve_mails'` |
| Modify `cloudfunctions/common/db.js` | mail CRUD / claim 事务辅助（若不宜塞进 PveMail） |
| Modify `cloudfunctions/common/admin/AdminConstants.js` | `SEND_MAIL` / `SEND_MAIL_BROADCAST`；`stardust` 替换 `diamond` |
| Modify `cloudfunctions/common/admin/AdminToolService.js` | 发信 + adjustResources 改星尘 |
| Modify `cloudfunctions/pve/index.js` | list/claim/claimAll/delete/markRead actions |
| Modify `cloudfunctions/initDb/index.js` | 创建 `pve_mails` |
| Modify `scripts/sync-cloud-common.js` | 复制 `pve/PveMail.js` |
| Modify `assets/scripts/network/PveService.ts` | 邮件 API 客户端 |
| Create `assets/scripts/pve/views/MailView.ts` | 邮箱弹层 UI |
| Modify `assets/scripts/lobby/PveLobbyController.ts` | 入口、红点、打开 MailView；`_diamondLabel`→星尘 |
| Modify `gm-web/src/*` | 发信 UI；钻石→星尘 |
| Docs | design.md / CALL_FLOW / PROJECT_NAVIGATION / ddl 如有 |

---

### Task 1: `PveMail` 纯逻辑 + 单测

**Files:**
- Create: `cloudfunctions/common/pve/PveMail.js`
- Create: `cloudfunctions/common/__tests__/PveMail.test.js`
- Modify: `scripts/sync-cloud-common.js`（加入 `pve/PveMail.js`）

**Interfaces:**
- Produces:
  ```js
  normalizeAttachment(input) // -> { type: 'stardust'|'stamina', amount: number } | throw
  normalizeMailInput({ title, body, attachments })
  canDeleteMail(mail) // !deleted && (attachments empty || claimed)
  applyMailAttachmentsToUserState({ profile, stamina, staminaUpdatedAt }, attachments, now)
  // -> { profile, stamina, staminaUpdatedAt, staminaNextRecoveryAt }
  buildMailView(doc) // 列表项
  isUnread(mail) // !read || (hasAttachments && !claimed)
  ```

- [ ] **Step 1: Write failing tests**

`cloudfunctions/common/__tests__/PveMail.test.js`:

```js
const {
  normalizeMailInput,
  canDeleteMail,
  applyMailAttachmentsToUserState,
  isUnread,
} = require('../pve/PveMail');
const { createDefaultProfile } = require('../pve/PveProfile');
const { STAMINA_MAX } = require('../pve/PveStamina');

describe('PveMail', () => {
  test('normalizeMailInput accepts empty attachments', () => {
    const m = normalizeMailInput({ title: 'hi', body: 'body', attachments: [] });
    expect(m.title).toBe('hi');
    expect(m.attachments).toEqual([]);
  });

  test('rejects bad attachment type or non-positive amount', () => {
    expect(() => normalizeMailInput({
      title: 't', body: 'b', attachments: [{ type: 'diamond', amount: 1 }],
    })).toThrow();
    expect(() => normalizeMailInput({
      title: 't', body: 'b', attachments: [{ type: 'stardust', amount: 0 }],
    })).toThrow();
  });

  test('apply stardust and stamina with cap', () => {
    const profile = { ...createDefaultProfile(1), gold: 10 };
    const next = applyMailAttachmentsToUserState(
      { profile, stamina: STAMINA_MAX - 2, staminaUpdatedAt: 1 },
      [{ type: 'stardust', amount: 5 }, { type: 'stamina', amount: 10 }],
      1000,
    );
    expect(next.profile.gold).toBe(15);
    expect(next.stamina).toBe(STAMINA_MAX);
  });

  test('canDelete only when no unclaimed attachments', () => {
    expect(canDeleteMail({ attachments: [], claimed: false, deleted: false })).toBe(true);
    expect(canDeleteMail({
      attachments: [{ type: 'stardust', amount: 1 }],
      claimed: false,
      deleted: false,
    })).toBe(false);
    expect(canDeleteMail({
      attachments: [{ type: 'stardust', amount: 1 }],
      claimed: true,
      deleted: false,
    })).toBe(true);
  });

  test('unread when unread flag or unclaimed attachments', () => {
    expect(isUnread({ read: false, claimed: true, attachments: [] })).toBe(true);
    expect(isUnread({
      read: true, claimed: false, attachments: [{ type: 'stamina', amount: 1 }],
    })).toBe(true);
    expect(isUnread({ read: true, claimed: true, attachments: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd cloudfunctions/common && npm test -- PveMail.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Implement `PveMail.js`**

实现上述导出；体力叠加用 `PveStamina.resolveStamina` 先归一再 `min(STAMINA_MAX, stamina + amount)`，并重算 `nextRecoveryAt`（与现有体力字段一致：写入 user 的 `pveStamina` / `pveStaminaUpdatedAt` 在 Task 2 接线时完成，纯函数只返回数值）。

- [ ] **Step 4: Add to sync list**

在 `scripts/sync-cloud-common.js` 的 `COPY_SUBDIR_FILES` 增加 `'pve/PveMail.js'`。

- [ ] **Step 5: Run tests — PASS，然后 commit**

```bash
cd cloudfunctions/common && npm test -- PveMail.test.js
git add cloudfunctions/common/pve/PveMail.js cloudfunctions/common/__tests__/PveMail.test.js scripts/sync-cloud-common.js
git commit -m "feat(pve): add PveMail pure helpers for claim rules"
```

---

### Task 2: DB + `pve` 云函数邮件 actions

**Files:**
- Modify: `cloudfunctions/common/constants.js`
- Modify: `cloudfunctions/common/db.js`（或新建 `cloudfunctions/common/pve/PveMailStore.js` 若 `db.js` 过大——优先薄封装在 `PveMailService.js`）
- Create: `cloudfunctions/common/pve/PveMailService.js`（异步：list/claim/delete/create）
- Modify: `cloudfunctions/pve/index.js`
- Modify: `scripts/sync-cloud-common.js`（若新增 Service 文件）
- Modify: `cloudfunctions/initDb/index.js`
- Test: `cloudfunctions/common/__tests__/PveMailService.test.js`（可用 mock db；若项目惯用集成测可精简为对 Service 与 fake repo）

**Interfaces:**
- Consumes: Task 1 helpers；`normalizeProfile`；`runTransactionWithRetry`
- Produces（对云函数）:
  ```js
  listMailsForUser(userId) -> { mails, unreadCount }
  claimMailForUser(user, mailId) -> { mail, profile?, stamina? }
  claimAllMailsForUser(user) -> { claimedCount, profile?, stamina? }
  deleteMailForUser(userId, mailId)
  markMailReadForUser(userId, mailId)
  createMailForUser({ userId, title, body, attachments, createdBy, reason, batchId? })
  ```

- [ ] **Step 1: Add `COLLECTIONS.PVE_MAILS = 'pve_mails'`；initDb 列表加入 `'pve_mails'`**

- [ ] **Step 2: Implement `PveMailService.js`**

- `list`：`where userId + deleted != true`，按 `createdAt` 降序，limit 100。
- `claim`：事务内读 mail，校验归属；若已 `claimed` 幂等返回；否则 `applyMailAttachmentsToUserState`，写回 `users` 的 `pveProfile.gold`、`pveStamina`、`pveStaminaUpdatedAt`，mail `claimed/read=true`。
- `claimAll`：查出未领有附件邮件，逐封或单事务批量（钉死：**逐封事务**，避免超时；返回成功计数）。
- `delete`：`canDeleteMail` 否则抛 `PVE_MAIL_CLAIM_REQUIRED`。
- `create`：生成 id（复用 `id.js`）、写入集合。

- [ ] **Step 3: Wire `cloudfunctions/pve/index.js`**

```js
if (action === 'listMails') { ... }
if (action === 'claimMail') { ... }
if (action === 'claimAllMails') { ... }
if (action === 'deleteMail') { ... }
if (action === 'markMailRead') { ... }
```

鉴权与现有 `pve` 一致（取当前 user）。

- [ ] **Step 4: 单测或最小集成断言 + sync**

```bash
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test -- PveMail
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): cloud mail list/claim/delete APIs"
```

---

### Task 3: GM 发信 + 钻石改为星尘（admin）

**Files:**
- Modify: `cloudfunctions/common/admin/AdminConstants.js`
- Modify: `cloudfunctions/common/admin/AdminToolService.js`
- Modify: `scripts/sync-cloud-common.js`（若未改）
- Test: 扩展现有 admin 测或 `AdminToolService` 相关测（有则补 sendMail 用例）

**Interfaces:**
- Produces actions: `sendMail`、`sendMailBroadcast`
- `RESOURCE_TYPES`: `{ STARDUST: 'stardust', STAMINA: 'stamina' }`（删除 `DIAMOND`）
- `adjustResources`：`stardust` 增减写 `pveProfile.gold`（normalize 后写回）；`stamina` 逻辑保持
- `toPlayerView` / list：展示 `stardust: profile.gold`，去掉对外 `diamond` 字段（或保留但 UI 不用——**钉死删除 view 中的 diamond，改为 stardust**）

- [ ] **Step 1: Constants + adjustResources 改星尘**

`adjustResources` 分支：

```js
if (resourceType === RESOURCE_TYPES.STARDUST) {
  // read normalizeProfile(user.pveProfile).gold, add amount, reject < 0
  // overwriteUserDocsWithPveProfile or update pveProfile.gold
}
```

限额：`STARDUST: 999999`，`STAMINA` 保持。

- [ ] **Step 2: `sendMailAction`**

`getTargetUser` → `createMailForUser` → `writeAdminLog`。

- [ ] **Step 3: `sendMailBroadcastAction`**

分页拉 `users`（每批 50），每用户 `createMailForUser` 同 `batchId`；记录 `affectedUsers`；单次硬顶 **500** 用户（超出返回明确错误码 `ADMIN_BROADCAST_TOO_LARGE`，计划可后续改异步）。

- [ ] **Step 4: `handleAdminAction` switch 注册；sync；commit**

```bash
node scripts/sync-cloud-common.js
git commit -m "feat(gm): send mail actions and replace diamond adjust with stardust"
```

---

### Task 4: 客户端 `PveService` + `MailView` + 大厅入口

**Files:**
- Modify: `assets/scripts/network/PveService.ts`
- Create: `assets/scripts/pve/views/MailView.ts`（+ `.meta` 由编辑器或工具生成；若仓库惯用手工可只交 ts）
- Modify: `assets/scripts/lobby/PveLobbyController.ts`
- Modify: `PROJECT_NAVIGATION.md`（入口一行）

**Interfaces:**
- `listMails()` / `claimMail(mailId)` / `claimAllMails()` / `deleteMail(mailId)` / `markMailRead(mailId)`
- `MailView` callbacks: `onClose`、`onClaim`、`onClaimAll`、`onDelete`、`onOpen(mailId)`

- [ ] **Step 1: PveService 类型与 API**

去掉/避免在邮件路径使用 diamond；`UpdateMetaReport` 注释里的 Diamond 改为「已废弃，勿用」或删除 diamond 字段（若仍有调用先 grep 再删）。

- [ ] **Step 2: MailView 弹层**

风格对齐 `MinghenShopView`：居中面板、列表、详情、一键领取、关闭。无附件显示「通知」；有附件显示「星尘 xN / 体力 xN」。

- [ ] **Step 3: Lobby**

- `_buildTopBar` 后在 `PlayerCard` 下方建 `MailEntry`（约 `y - CARD_H/2 - 36`）。
- `onLoad`/refresh 时 `listMails` 更新红点。
- 打开 MailView；领取后 `_applyStardust` + 刷新体力。
- 将 `_diamondLabel` 重命名 `_stardustLabel`，节点名 `StardustChip`（保持 `icon_chip_stardust`）。

- [ ] **Step 4: 手工验收清单写在 commit body；commit**

```bash
git commit -m "feat(lobby): mailbox UI and mail cloud client"
```

---

### Task 5: GM Web 发信 UI + 钻石文案清除

**Files:**
- Modify: `gm-web/src/types.ts`
- Modify: `gm-web/src/main.ts`
- Modify: `gm-web/src/api.ts`（若需）

- [ ] **Step 1: types**

`ResourceType = 'stardust' | 'stamina'`；`AdminAction` 增加 `sendMail` | `sendMailBroadcast`；`PlayerView.diamond` → `stardust`。

- [ ] **Step 2: 玩家详情与资源表单**

所有「钻石」文案→「星尘」；默认 resource `stardust`。

- [ ] **Step 3: 发信表单**

字段：目标（当前选中玩家 / 勾选全服）、title、body、附件（无/星尘/体力+数量）、reason。提交 `sendMail` 或 `sendMailBroadcast`。

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(gm-web): mail composer and stardust-only resources"
```

---

### Task 6: 文档同步

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `CALL_FLOW.md`
- Modify: `PROJECT_NAVIGATION.md`
- Optional: `specs/260608-pve-destiny-expedition/ddl-sql.md` 增 `pve_mails`

- [ ] **Step 1: design.md** — 邮箱规则、领取入账、货币仅星尘、GM 发信。
- [ ] **Step 2: CALL_FLOW** — 大厅邮箱与 GM 发信链。
- [ ] **Step 3: PROJECT_NAVIGATION** — 邮箱入口 `PveLobbyController` + `MailView` + `PveMailService`。
- [ ] **Step 4: Commit**

```bash
git commit -m "docs(pve): document mail system and stardust-only currency"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| pve_mails + fan-out | 2–3 |
| list/claim/claimAll/delete | 1–2, 4 |
| GM 单人/全服 | 3, 5 |
| 大厅入口+红点+UI | 4 |
| 清钻石 | 3, 4, 5 |
| initDb | 2 |
| 文档 | 6 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-28-mail-system.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每 Task 新子代理，Task 间审查  
2. **Inline Execution** — 本会话按计划连续执行  

Which approach?
