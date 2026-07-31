# 营地背包扩容（虚空革）

日期：2026-07-31  
状态：实现完成  
关联：`CampView` 共用背包、`PveCamp`、`PveProfile`、`2026-07-31-camp-materials-v1-design.md`、`2026-07-31-camp-ui-glyph-inventory-design.md`  
主文档同步：实现时更新 `specs/260608-pve-destiny-expedition/design.md`

## 1. 目标

- 共用背包容量可升级：`25 → 35 → 45 → 60`。
- 新增专用材料 **虚空革**（`voidHide`）+ 星尘消耗；Boss/精英通关获取。
- 营地两台背包标题旁可发起扩容；本轮提供可点占位 UI，精修板式/图标留给后续会话。

## 2. 已定决策

| 项 | 选择 |
|---|---|
| 容量阶梯 | `25 → 35 → 45 → 60`（三档） |
| 材料 | 一种：虚空革（空间皮革隐喻）+ 星尘 |
| 获取 | Boss 层 +2；精英目标层（非 Boss）+1；普通层 0；CLEAR 才给 |
| 消耗 | 每档：虚空革 + 星尘，递涨 |
| 入口 | 命痕台/装备台共用背包标题行「扩容」 |
| 权威 | `materials` 扩字段 + `bagCapacity`；`PveCamp` `UPGRADE_BAG` |
| 本轮不做 | 精修扩容面板美术、虚空革正式图标绘制、星尘兑换材料、出售附带虚空革 |

## 3. 数据

```ts
materials?: {
  quenchSand: number;
  fusionCore: number;
  voidHide: number; // 虚空革
};
bagCapacity?: number; // 默认 25；合法值仅 25|35|45|60
```

归一化：

- 缺省材料字段 → 0；非负整数截断。
- 缺省 / 非法 `bagCapacity` → **25**（只接受 `25|35|45|60`，否则回落 25）。

客户端 Layout / 共用背包占位格数读取 `profile.bagCapacity`（替代写死 `CAMP_BAG_SLOTS = 25` 作为唯一容量源；常量保留为**起步默认**）。

## 4. 消耗表（云端权威；客户端镜像预览）

| 当前 → 目标 | 星尘 | 虚空革 |
|---|---:|---:|
| 25 → 35 | 120 | 3 |
| 35 → 45 | 240 | 6 |
| 45 → 60 | 400 | 10 |

满级合计：星尘 760 · 虚空革 19。  
已是 60：`PVE_BAG_MAX`，不扣费。

错误码：

- `PVE_STARDUST_NOT_ENOUGH`
- `PVE_VOID_HIDE_NOT_ENOUGH`
- `PVE_BAG_MAX`

## 5. 获取

仅楼层 **CLEAR** 入账（与淬星砂/聚星核同一结算门控；`TRIAL` / `PRACTICE` 不给）。

| 条件 | 虚空革 |
|---|---:|
| Boss 层 CLEAR | +2 |
| 非 Boss，但本层有精英通关目标 / 结算标记 `hadElite` | +1 |
| 其他 | 0 |

不出售附带；不星尘兑换。

落点：现有 `settlementMaterialGrants`（或等价）扩展返回 `voidHide`，与 `quenchSand` / `fusionCore` 一并写入 profile。

## 6. 营地交互（占位可用）

1. 共用背包标题行右侧「扩容」按钮（两台都有）。
2. 点击 → 简易确认层：展示「当前 N → 目标 M」与费用；材料/星尘不足则按钮不可点或点后 toast。
3. 成功 → 云端回写后刷新：`bagCapacity`、材料数量、背包空槽外框变多。
4. 虚空革在共用背包材料滤镜中展示：数量 > 0 才占格；占位色块 + 数量；预留图标 path（如 `pve/lobby/icon_mat_void_hide`），资源缺失时不崩。

## 7. 权威与同步

- 改 `cloudfunctions/common/pve/*`（`PveProfile` 默认/归一化、`PveCamp` `UPGRADE_BAG`、结算材料授予），再 `node scripts/sync-cloud-common.js`。
- 客户端：`EquipmentProgression` / 新建 `BagUpgrade.ts`（纯逻辑表）镜像费用；`CampController` 调云；`CampView` / `CampSharedBag` / Layout 读容量。
- 同步 `design.md` 营地背包条；可补一句到 materials v1 规格「扩展 voidHide」。

## 8. 验收

1. 三档升级按表扣星尘与虚空革；任一不足失败且不改容量。
2. 满级不可再升。
3. Boss CLEAR +2、精英非 Boss +1、普通 0；试炼/练习 0。
4. 两台背包标题均可发起扩容；成功后槽位上限立即变为新容量。
5. 虚空革仅 `amount > 0` 入包展示。
6. 相关 jest 通过；部署 `pve` 云函数后真机可用。
7. 不依赖新 PNG 也能跑通（缺图标走占位）。

## 9. 后续会话（美术）

- 绘制虚空革背包图标并接到预留 path。
- 可选：扩容确认面板板式精修（本规格交互不变）。
