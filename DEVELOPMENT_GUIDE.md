# DEVELOPMENT_GUIDE.md

> 当前开发规则。改代码前先读本文件，再按 `PROJECT_NAVIGATION.md` 和 `CALL_FLOW.md` 定位入口。

---

## 1. 定位流程

1. 先查 `PROJECT_NAVIGATION.md`，确认当前系统入口。
2. 再查 `CALL_FLOW.md`，确认调用链。
3. 从入口文件顺着调用链追，不要从中间文件凭印象改。
4. 只有导航无法定位时，才用全局搜索。

---

## 2. 当前 PVE 主线

当前 PVE 以永久逐层挑战为目标态：

- 大厅远征：`PveLobbyController` 选择楼层。
- 战斗场景：`ExpeditionController` 是唯一战斗场景控制器。
- 挑战生命周期：`PersistentFloorFlow`。
- 持久运行态：`PersistentExpeditionRuntime`。
- 云端档案/挑战：`PveProfile` + `PveChallenge`。
- 营地：`CampController` + `CampView`（远征情报文案须对齐 `Chapter1Objectives`，第四层称「哨兵」勿写「传令兵」）。
- 战斗 HUD「目标」：展示本层通关条件（仅主目标），不是词条、不是可选目标。
- `updatePveMeta` 仅负责教学等账户标记。

当前约束：只扩展 ExpeditionController、PersistentFloorFlow、当前章节工厂、三职业、固定装备目录与命痕事件链。

---

## 3. PVE 三层约束

```text
pve/core/
  纯逻辑层：禁止 import 'cc'，禁止直接 Math.random()，使用 rng.ts。
  输入 state，返回新 state + events。

pve/controllers/
  编排层：处理输入、网络、事件回放和状态同步。
  ExpeditionController 是当前远征战斗唯一主控制器。

pve/views/
  渲染层：只消费 state/events，写 Label/Sprite/Graphics。
  不直接发云函数，不直接改规则状态。
```

---

## 4. 常见修改入口

| 修改类型 | 当前入口 |
| --- | --- |
| 战斗伤害 / 攻击 | `assets/scripts/pve/core/CombatSystem.ts` |
| 固定武器/职业攻击上下文 | `assets/scripts/pve/core/PersistentCombatRules.ts` |
| 移动规则 | `assets/scripts/pve/core/MovementSystem.ts` |
| 怪物 AI | `assets/scripts/pve/core/MonsterAI.ts` |
| 楼层目标 / 命痕运行态 | `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` |
| 第一章楼层内容 | `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts` / `Chapter1FloorGenerator.ts` |
| 传送门/出口/钥匙 | `assets/scripts/pve/core/FloorRules.ts` |
| 祭坛/神像/温泉/铁匠 | `assets/scripts/pve/core/NeutralEntities.ts` |
| 命痕定义和效果 | `assets/scripts/pve/core/minghen/MinghenCatalog.ts` / `MinghenCombatBridge.ts` |
| 战斗表现 | `assets/scripts/pve/controllers/ExpeditionController.ts` / `assets/scripts/pve/views/FogMapView.ts` |
| 营地 UI | `assets/scripts/pve/controllers/CampController.ts` / `assets/scripts/pve/views/CampView.ts` |
| 云端玩家档案 | `cloudfunctions/common/pve/PveProfile.js` |
| 云端挑战生命周期 | `cloudfunctions/common/pve/PveChallenge.js` |
| GM 工具 | `cloudfunctions/common/admin/AdminToolService.js` + `gm-web/src/**` |

---

## 5. 云函数规则

`cloudfunctions/common/` 是共享源码唯一权威源。

正确流程：

```bash
# 只改 cloudfunctions/common/**
node scripts/sync-cloud-common.js
```

不要直接改：

- `cloudfunctions/pve/common/**`
- `cloudfunctions/adminTool/common/**`
- `cloudfunctions/login/common/**`
- 其它云函数目录下的 `common/**`

这些都是同步副本，下次 sync 会覆盖。

---

## 6. Cocos 资源安全规则

不要直接文本编辑：

- `.scene`
- `.prefab`
- `.anim`
- `.meta`

这些文件有 UUID 引用，直接改容易造成资源导入失败。需要改场景/预制体时用 Cocos MCP 工具。

普通 `.ts/.js/.md` 可以正常补丁编辑。

---

## 7. 验证建议

按风险选择验证：

```bash
npm run typecheck
npm run test:pve
```

针对持久逐层远征，优先跑：

```bash
npx jest --roots test/pve --runTestsByPath test/pve/Chapter1Floor1to7.test.ts test/pve/Chapter1ExpeditionFactory.test.ts test/pve/PersistentExpeditionRuntime.test.ts test/pve/PersistentFloorFlow.test.ts --runInBand
```

---

## 8. 文档同步

改 PVE 玩法规则时，同步：

- `specs/260712-pve-persistent-floor-progression/design.md`
- 必要时同步 `specs/260608-pve-destiny-expedition/design.md`

已失效的玩法文档必须删除；当前规则只写入对应主设计文档。
