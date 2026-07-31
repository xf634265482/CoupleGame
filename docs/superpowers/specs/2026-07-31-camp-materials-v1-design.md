# 营地材料经济 v1（淬星砂 / 聚星核）

日期：2026-07-31  
状态：已确认开工  
关联：打造 v1、`PveCamp`、`equipment-catalog.md`、`design.md`

## 1. 目标

- 强化、合成不再只扣星尘：各绑一种专用材料 + 星尘。
- 材料数量写入 `pveProfile`，营地背包展示持有量（本轮用数字/占位条，美术后接）。
- 旧档缺字段视为 0。

## 2. 材料

| ID | 字段 | 中文 | 用途 |
|---|---|---|---|
| `QUENCH_SAND` | `materials.quenchSand` | 淬星砂 | 强化 |
| `FUSION_CORE` | `materials.fusionCore` | 聚星核 | 三合一升品 |
| `VOID_HIDE` | `materials.voidHide` | 虚空革 | 背包扩容（见 `2026-07-31-camp-bag-upgrade-design.md`） |

```ts
materials?: { quenchSand: number; fusionCore: number; voidHide?: number }
```

归一化：缺省 / 非负整数截断；读档时保证对象存在。

## 3. 消耗

### 3.1 强化（相对旧表星尘约 ×0.67）

| 目标 +N | 星尘 | 淬星砂 |
|---:|---:|---:|
| 1 | 20 | 2 |
| 2 | 40 | 3 |
| 3 | 70 | 5 |
| 4 | 120 | 8 |
| 5 | 180 | 12 |

错误码：`PVE_STARDUST_NOT_ENOUGH` / `PVE_QUENCH_SAND_NOT_ENOUGH`

### 3.2 合成（按材料品质）

| 品质 | 星尘 | 聚星核 |
|---|---:|---:|
| COMMON | 10 | 1 |
| FINE | 20 | 2 |
| RARE | 40 | 3 |
| EPIC | 80 | 5 |

错误码：`PVE_STARDUST_NOT_ENOUGH` / `PVE_FUSION_CORE_NOT_ENOUGH`

## 4. 获取

### 4.1 楼层结算（CLEAR；试炼/练习是否给材料：与星尘奖励同模式——TRIAL/PRACTICE 不给或按现有 reward 门控）

- 淬星砂：`2 + (globalFloor % 7)`；若本层为 Boss 目标再 `+6`
- 聚星核：Boss 层 `+2`；否则若本层含精英通关目标（或结算标记 `hadElite`）`+1`；否则 `0`

实现落点：与 `rewards.gold` 一同在 `settleFloorChallenge` / `PveRewardV2` 或 `PveChallengeState` 入账，保证云端权威。

### 4.2 出售装备（在原有星尘价之外）

- 淬星砂：`1 + enhanceLevel`
- 聚星核：COMMON/FINE `0`；RARE `1`；EPIC `2`；LEGENDARY `3`

## 5. UI（本轮）

- 营地装备台背包区顶部或侧栏展示两行数量：`淬星砂 ×N` / `聚星核 ×M`（纯 Label，便于后会话换图标）。
- 强化/合成按钮文案带上材料消耗；不足时 disabled 或点后弹错。
- **不本轮**：独立材料图标资源、独立材料页、星尘兑换材料。

## 6. 权威与同步

- 只改 `cloudfunctions/common/pve/*`，再 `node scripts/sync-cloud-common.js`
- 客户端 `EquipmentProgression.ts` 镜像消耗表供 UI 预览；扣费以云端为准
- 同步 `design.md` §6、`equipment-catalog.md`

## 7. AC

1. 强化同时扣星尘与淬星砂；任一不足失败且不改库存。
2. 合成同时扣星尘与聚星核。
3. 通关入账材料；出售额外给材料。
4. 营地可见两种材料数量。
5. 相关 jest 通过；部署 `pve` 云函数后真机可用。
