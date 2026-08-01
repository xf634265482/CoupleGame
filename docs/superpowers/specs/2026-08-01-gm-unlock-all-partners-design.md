# GM 伙伴全解锁

日期：2026-08-01  
状态：已确认  
关联：`2026-07-29-partner-progressive-unlock-design.md`、`AdminToolService`、`PvePartner`

## 1. 目标

GM 可一键将指定玩家六只伙伴全部开锁，便于测试；**重置远征后仍回全锁并按 progressive 条件解锁**；GM 开锁后玩家再通关达到条件时**不报错、不冲突**（幂等跳过）。

## 2. 已确认决策

| 项 | 选择 |
|----|------|
| 开锁深度 | 只设 `unlocked: true`；等级 / 经验 / 进化保留 |
| 方案字段 | **不**改 `partnerUnlockScheme`（保持 `progressive`，不切 `legacy`） |
| 装备 | 若当前无已装备伙伴，自动装备 `MOBILITY`；已有装备则不动 |
| 重置 | 沿用现有 `resetExpedition` → `createDefaultProfile`（全锁 + progressive） |
| 通关再达标 | 沿用 `applyPartnerUnlocks`：已解锁跳过；`newlyUnlockedPartnerIds` 不含已开 |

## 3. 行为

### 3.1 GM `unlockAllPartners`

- 鉴权与现有 admin 一致；payload：`userId` / `openId` + `reason`。
- 读档 → `normalizeProfile` → 对 `PARTNER_IDS` 每一只：
  - `partners[id] = { ...normalizeOne(partners[id]), unlocked: true }`
- `partnerUnlockScheme` 保持原值（缺省按 normalize 为 `progressive`）。
- 若 `equippedPartnerId` 为空或指向未解锁（理论上不会），设为 `MOBILITY`。
- 写回 `pveProfile`；写 admin 日志；返回更新后的 player view。

### 3.2 与自然解锁共存

- `applyPartnerUnlocks` / `grantStarterPartnerOnProfile` 已对已解锁幂等；本功能**禁止**改成「已解锁则抛错」。
- 揭晓 UI 只消费 `newlyUnlockedPartnerIds`；GM 已开的伙伴通关时列表为空，不弹窗、不报错。

### 3.3 重置

- 不新增重置逻辑；`resetExpedition` 已清档重建，伙伴回到默认全锁。

## 4. 改动面

| 层 | 点 |
|----|-----|
| 纯逻辑 | `cloudfunctions/common/pve/PvePartner.js`：`unlockAllPartnersOnProfile(profile)` |
| 单测 | `PvePartner.test.js`：全开；开后 `applyPartnerUnlocksOnProfile` 无新增；scheme 仍 progressive |
| Admin | `AdminConstants` + `AdminToolService.unlockAllPartnersAction` |
| GM Web | 玩家操作区按钮「解锁全部伙伴」 |
| 文档 | `specs/260608-pve-destiny-expedition/design.md` §7.1 一行；本 spec |

## 5. AC

1. GM 对目标玩家执行后，六只伙伴 `unlocked === true`，scheme 仍为 `progressive`（新档）。
2. 已养成进度（level/exp/stage）不被清零。
3. 再通关达到解锁层：settle 成功，无错误码；无重复揭晓。
4. GM 重置远征后伙伴全锁，可重新按教程/通关条件解锁。
5. 操作写 admin 日志且需填写 reason。

## 6. 非目标

- 单只伙伴 GM 开关
- 通过 GM 改等级/进化
- 改 `legacy` 语义或倒扣老档
