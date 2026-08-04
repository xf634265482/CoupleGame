# Partner Progressive Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把伙伴从「六只默认全解锁」改为 progressive：教程发位移，通关 3/5/7/10/17 解锁其余五只；清档重解；legacy 老档不倒扣。

**Architecture:** 客户端 `PartnerUnlock.ts` 与云端 `PvePartner.js` 同构解锁表；`partnerUnlockScheme` 区分 progressive/legacy；通关写档与教程发放改档案 `unlocked`；UI 锁态展示；开局快照允许 `partnerId: null`。

**Tech Stack:** Cocos TS（`assets/scripts/pve`）、`cloudfunctions/common/pve`、Jest（`npm run test:pve` + `cd cloudfunctions/common && npm test`）。

## Global Constraints

- 不抬 `PVE_PROFILE_VERSION`；软迁移。
- 解锁表固定：GUARD@3 HEAL@5 BREAKER@7 CONTROL@10 ANIMA@17；MOBILITY 仅教程发放。
- 新档 / 清档：`partnerUnlockScheme: 'progressive'`，六只 `unlocked: false`，`equippedPartnerId: null`。
- 老档：缺 scheme 且已有任一 unlocked → `'legacy'` 不倒扣；无 partners 且 `highestClearedFloor > 0` → legacy + 六只全开。
- `unlocked` 判定改为严格 `=== true`。
- 装备回退：目标未解锁时不得默认塞 MOBILITY；MOBILITY 未解锁则 `equippedPartnerId = null`。
- 改 `cloudfunctions/common/**` 后必须 `node scripts/sync-cloud-common.js`。
- 玩法变更同步 `specs/260608-pve-destiny-expedition/design.md` §7.1。
- Spec 权威：`docs/superpowers/specs/2026-07-29-partner-progressive-unlock-design.md`。

---

## File Structure

| Path | Responsibility |
|---|---|
| Create: `assets/scripts/pve/core/partner/PartnerUnlock.ts` | 解锁表、条件文案、`applyPartnerUnlocks`、`grantStarterPartner` 纯函数 |
| Modify: `PartnerProfile.ts` / `PartnerTypes.ts` | 默认全锁、scheme、equipped 可为 null |
| Modify: `PveProgressionTypes.ts` | `partnerUnlockScheme` |
| Modify: `cloudfunctions/common/pve/PvePartner.js` | 与客户端同构 unlock/grant/normalize |
| Modify: `PveProfile.js` | createDefault + normalize 写入 scheme |
| Modify: `PveChallengeState.js` | 通关后 `applyPartnerUnlocks`，回包 `newlyUnlockedPartnerIds` |
| Modify: `PveChallengeValidate.js` | `partnerId` 允许 null |
| Modify: `PveMeta.js` 或挑战开局路径 | 教程发放兜底 |
| Modify: `PartnerView.ts` / HUD / ExpeditionController | 锁态 UI、无伙伴禁用、教程发放触发 |
| Test: `test/pve/PartnerUnlock.test.ts`、更新 migrate / cloud tests |
| Docs: `design.md` §7.1 |

---

### Task 1: 解锁纯函数 + 默认档案改全锁（客户端）

**Files:**
- Create: `assets/scripts/pve/core/partner/PartnerUnlock.ts`
- Modify: `assets/scripts/pve/core/partner/PartnerTypes.ts`
- Modify: `assets/scripts/pve/core/partner/PartnerProfile.ts`
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts`（加 `partnerUnlockScheme?: 'progressive' | 'legacy'`）
- Test: `test/pve/PartnerUnlock.test.ts`
- Modify: `test/pve/PartnerProfileMigrate.test.ts`

**Interfaces:**
- Produces:
  - `PARTNER_UNLOCK_BY_CLEAR_FLOOR: Readonly<Partial<Record<PartnerId, number>>>`
  - `partnerUnlockHint(id): string`
  - `applyPartnerUnlocks(partners, clearedFloor): { partners; newlyUnlockedPartnerIds: PartnerId[] }`
  - `grantStarterPartner(partners, equipped): { partners; equippedPartnerId: 'MOBILITY'; newlyUnlockedPartnerIds }`
  - `normalizePartners(...)` → `{ partners; equippedPartnerId: PartnerId | null; partnerUnlockScheme }`
  - `createDefaultPartners()` → 全锁 + `equippedPartnerId: null` + scheme `progressive`

- [ ] **Step 1: Write failing tests** in `test/pve/PartnerUnlock.test.ts`：默认全锁；通关 7 连解 GUARD/HEAL/BREAKER；教程发放幂等；MOBILITY 未解锁时 equipped 为 null；legacy 输入保持 unlocked。
- [ ] **Step 2: Run** `npx jest --roots test/pve --testPathPattern PartnerUnlock` → FAIL。
- [ ] **Step 3: Implement** `PartnerUnlock.ts` + 改 `PartnerProfile` / types。
- [ ] **Step 4: Run tests** → PASS；更新 `PartnerProfileMigrate.test.ts` 期望。
- [ ] **Step 5: Commit** `feat(pve): partner unlock helpers and locked defaults`

---

### Task 2: 云端 PvePartner + Profile normalize + sync

**Files:**
- Modify: `cloudfunctions/common/pve/PvePartner.js`
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Modify: `cloudfunctions/common/__tests__/PvePartner.test.js`
- Run: `node scripts/sync-cloud-common.js`

**Interfaces:**
- Produces: `applyPartnerUnlocksOnProfile(profile, clearedFloor)`、`grantStarterPartnerOnProfile(profile)`；`normalizePartnersMap` 返回 scheme + nullable equipped；export 解锁表。

- [ ] **Step 1: Update cloud tests** — 新档全锁、equipped null、scheme progressive；旧档有 unlocked → legacy；apply 按层解锁；grant starter 幂等；equip 未解锁抛 `PVE_PARTNER_LOCKED`；equip null 允许 `equippedPartnerId: null`。
- [ ] **Step 2: Run** `cd cloudfunctions/common && npm test -- --testPathPattern PvePartner` → FAIL。
- [ ] **Step 3: Implement** cloud helpers + `PveProfile` createDefault/normalize。
- [ ] **Step 4: sync + tests PASS。
- [ ] **Step 5: Commit** `feat(pve): cloud partner progressive unlock normalize`

---

### Task 3: 通关挂钩 + 开局快照允许无伙伴 + 教程发放

**Files:**
- Modify: `cloudfunctions/common/pve/PveChallengeState.js`（clear 后 apply unlocks，把 `newlyUnlockedPartnerIds` 放进 clear 结果）
- Modify: `cloudfunctions/common/pve/PveChallengeValidate.js`（`partnerId: null` 时 stage/level 用安全默认，不读 progress）
- Modify: `cloudfunctions/common/pve/PveMeta.js` 或 `pve/index` 路由：`tutorialCompleted` 时 `grantStarterPartnerOnProfile`
- Modify: 客户端挑战开局/教程进入路径（`ExpeditionController` / `PersistentFloorFlow` / `PveProgressionService`）确保教程层会触发发放并刷新 profile
- Test: 扩展 cloud challenge clear 相关测试（若已有）；否则在 `PvePartner.test.js` 覆盖 apply 被 clear 调用的集成断言

- [ ] **Step 1: Failing test** — clear 到 floor 3 后 GUARD unlocked；validate 无装备时 partnerId null。
- [ ] **Step 2: Implement clear + validate + tutorial grant。**
- [ ] **Step 3: sync + tests PASS。
- [ ] **Step 4: Commit** `feat(pve): grant partners on tutorial and floor clear`

---

### Task 4: PartnerView 锁态 + HUD 无伙伴 + toast

**Files:**
- Modify: `assets/scripts/pve/views/PartnerView.ts`
- Modify: `assets/scripts/pve/views/PveHudView.ts` / `ExpeditionController.ts`（无 `partnerId` 时禁用伙伴按钮）
- Modify: 通关结算 UI 路径（有 `newlyUnlockedPartnerIds` 则 toast）
- 可选：客户端 `partnerUnlockHint` 文案

- [ ] **Step 1: PartnerView** — 未解锁灰态、显示 `partnerUnlockHint`、禁用装备/进化。
- [ ] **Step 2: HUD** — snapshot/profile 无伙伴时 `setPartnerSkillState({ available: false, ... })` 或等价禁用。
- [ ] **Step 3: Toast** — 新解锁列表提示（多只用顿号拼接显示名）。
- [ ] **Step 4: Commit** `feat(pve): partner lock UI and unlock toast`

---

### Task 5: 设计文档 + 导航同步

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` §7.1
- Modify: `docs/superpowers/specs/2026-07-18-partner-system-design.md`（首版解锁行改为指向 progressive spec）
- 如需要：`CALL_FLOW.md` 补教程发放 / 通关解锁一行

- [ ] **Step 1: 更新文案** 与解锁表一致。
- [ ] **Step 2: Commit** `docs: partner progressive unlock in design.md`

---

## Spec Coverage Check

| Spec 项 | Task |
|---|---|
| 教程发 MOBILITY + 自动装备 | T3 |
| 通关 3/5/7/10/17 | T1/T2/T3 |
| 面板锁态文案 | T4 |
| legacy 不倒扣 / progressive 清档全锁 | T1/T2 |
| newlyUnlockedPartnerIds toast | T3/T4 |
| 无伙伴 HUD | T4 |
| design.md 同步 | T5 |
| 单测 | T1/T2/T3 |
