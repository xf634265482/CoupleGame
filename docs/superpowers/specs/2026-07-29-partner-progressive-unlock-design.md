# 伙伴逐步解锁设计

> 日期：2026-07-29  
> 状态：已确认，待实现  
> 前置：`docs/superpowers/specs/2026-07-18-partner-system-design.md`（首版六只默认全解锁）  
> 实现时同步：`specs/260608-pve-destiny-expedition/design.md` §7.1  

---

## 1. 目标

将伙伴从「开局六只全解锁」改为**逐步解锁**：教程送位移，其余按通关层数一个个开，第三章内解锁完。清档 / 新档必须重走解锁；已有全解锁的老档不倒扣。

---

## 2. 已确认产品决策

| 项 | 决策 |
|---|---|
| 开局 | 新档六只全锁，`equippedPartnerId: null` |
| 教程 | 进入第 1 层新手教程时发放并自动装备 `MOBILITY`；`tutorialCompleted` 上报时幂等兜底 |
| 解锁顺序 | 位移（教程）→ 守护 → 治疗 → 破阵 → 控场 → 灵气 |
| 通关门槛 | GUARD@3 / HEAL@5 / BREAKER@7 / CONTROL@10 / ANIMA@17（条件：通关该层，计入 `highestClearedFloor`） |
| 铺设节奏 | 混合；第三章结束前（含第 17 层）解锁完全部 |
| 面板 | 六只全展示；未解锁灰态 + 条件文案；不可装备/进化 |
| 老档 | `partnerUnlockScheme: 'legacy'` 保持已有解锁；新档 / 清档为 `'progressive'` |
| 架构 | 配置表 + 通关写档（云端权威）；客户端展示与 toast |

---

## 3. 解锁表

| 触发 | PartnerId | 面板文案 |
|---|---|---|
| 进入新手教程（幂等） | `MOBILITY` | 进入新手教程解锁 |
| 通关第 3 层 | `GUARD` | 通关第 3 层解锁 |
| 通关第 5 层 | `HEAL` | 通关第 5 层解锁 |
| 通关第 7 层 | `BREAKER` | 通关第 7 层解锁 |
| 通关第 10 层 | `CONTROL` | 通关第 10 层解锁 |
| 通关第 17 层 | `ANIMA` | 通关第 17 层解锁 |

一次通关可连解多只。回包携带 `newlyUnlockedPartnerIds: PartnerId[]` 供 toast。

---

## 4. 数据与迁移

### 4.1 档案字段

保持现有：

```ts
partners: Record<PartnerId, PlayerPartnerProgress>; // unlocked / level / exp / evolutionStage
equippedPartnerId: PartnerId | null;
```

新增软字段：

```ts
partnerUnlockScheme: 'progressive' | 'legacy';
```

### 4.2 默认值（progressive / 清档）

- 六只：`{ unlocked: false, level: 1, exp: 0, evolutionStage: 1 }`
- `equippedPartnerId: null`
- `partnerUnlockScheme: 'progressive'`

### 4.3 normalize / 迁移

- **不抬** `PVE_PROFILE_VERSION`。
- `normalizeOne`：`unlocked` 改为严格 `raw.unlocked === true`（缺省视为未解锁）。
- `createDefaultPartnersMap`：默认全锁（替换原「默认全开」）。
- 缺 `partnerUnlockScheme` 时判定：
  - 若 `partners` 中已有任一 `unlocked === true` → 标 `'legacy'`，保持现有 `unlocked`，不对未达层倒扣；
  - 若无 `partners` 字段但 `highestClearedFloor > 0`（旧档缺伙伴字段）→ 标 `'legacy'` 并一次补全六只全解锁；
  - 否则 → `'progressive'` + 全锁默认。
- `normalizePartnersMap` 的装备回退：仅当目标已解锁才装备；`MOBILITY` 未解锁时 `equippedPartnerId` 为 `null`（禁止再默认塞位移）。
- `legacy` 档：不做通关门槛倒扣；装备校验仍读实际 `unlocked`。
- `progressive` 档：教程发放 + 通关 `applyPartnerUnlocks`。

### 4.4 云端 API 落点

| 时机 | 行为 |
|---|---|
| 进入教程层 / `updatePveMeta(tutorialCompleted)` | `grantStarterPartner(profile)` → 解锁 MOBILITY、装备；已解锁则 no-op |
| 挑战通关写档 | `applyPartnerUnlocks(profile, highestClearedFloor)` |
| `equipPartner` / `evolvePartner` | 已有 `unlocked` 校验 |
| 装备伙伴异常未解锁 | 回退到已解锁的 `MOBILITY`，否则 `null` |

权威常量表（客户端 `core/partner/` 与云端 `PvePartner.js` 同构）：

```js
PARTNER_UNLOCK_BY_CLEAR_FLOOR = {
  GUARD: 3,
  HEAL: 5,
  BREAKER: 7,
  CONTROL: 10,
  ANIMA: 17,
};
```

改 `cloudfunctions/common/**` 后必须 `node scripts/sync-cloud-common.js`。

---

## 5. 客户端行为

- `PartnerView`：锁态样式 + 条件文案；禁用装备/进化。
- 通关 / 教程回包含 `newlyUnlockedPartnerIds` → toast（文案可后定，需能识别多只）。
- HUD：无装备伙伴时按钮禁用或提示「尚未获得伙伴」；有装备则逻辑不变。
- 未解锁伙伴不获得通关经验。

---

## 6. 非目标（本迭代不做）

- 不改进化试炼、星尘消耗、技能数值。
- 不做独立「伙伴图鉴」新场景。
- 不按章节 ID 解锁（只按绝对层数）。
- 不强制老档倒扣重解。

---

## 7. 验收

1. 清档后六只全锁，无装备伙伴；HUD 伙伴不可用。  
2. 进入新手教程 → 获得位移并自动装备；可在教程内使用技能教学。  
3. 通关 3 / 5 / 7 / 10 / 17 分别解锁守护 / 治疗 / 破阵 / 控场 / 灵气；面板文案正确。  
4. 未解锁不可装备、不可进化；一次可连解多只并 toast。  
5. `legacy` 老档保持全解锁，不倒扣。  
6. 单测覆盖：默认全锁、教程发放幂等、按层解锁、legacy 不倒扣、装备拒绝未解锁。

---

## 8. 实现落点（供计划引用）

| 区域 | 文件（预期） |
|---|---|
| 解锁表 / apply / grant | `assets/scripts/pve/core/partner/PartnerUnlock.ts` + `cloudfunctions/common/pve/PvePartner.js` |
| 默认档案 / normalize | `PveProgressionTypes.ts` / `PveProfile.js` / `PartnerProfile.ts` |
| 通关挂钩 | `PveChallengeState.js`（或 clear 写档路径） |
| 教程发放 | `ExpeditionController` 教程进入 + `PveMeta` / 现有 `updatePveMeta` |
| UI | `PartnerView.ts`；HUD 无伙伴禁用 |
| 测试 | `test/pve` + `cloudfunctions/common/__tests__` |
| 设计同步 | `specs/260608-pve-destiny-expedition/design.md` §7.1 |
