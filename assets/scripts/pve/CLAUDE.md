# assets/scripts/pve/ — PVE「命运远征」模块

单人迷雾爬塔，与 PVP **完全独立**。

## 三层结构

```
pve/
  core/          # 纯逻辑（零 cc 依赖、确定性、ts-jest 可测）
  controllers/   # @ccclass cc.Component，编排输入/动画/网络
  views/         # 普通类，纯渲染（Graphics + Label 占位风格）
```

- `core/` **禁止** `import ... from 'cc'`、禁止直接 `Math.random()`（用 `core/rng.ts` 的 mulberry32）
- `controllers/` 接收用户输入、调用 `core/ExpeditionState` 的纯函数、根据返回的事件列表回放动画、调用 `network/PveService` 存档
- `views/` 不持有规则，只画当前态

## 测试

```bash
npm run test:pve     # 跑 test/pve/ 下的 ts-jest 套件
```

测试在 **repo 根 `test/pve/`**，不在 `assets/` 内（否则会被 Cocos 编译进游戏包）。

## 权威模型

**客户端模拟 + 云端校验**（不是 PVP 那种全云端权威）：

- 局内玩法（迷雾/AP/战斗/AI/掉落）在 `core/` 即时运行
- `cloudfunctions/pve` 只做：每层存档 + 元货币（钻石/命运碎片）入账时的边界校验
- 服务端按"已通关层数"纯计算奖励，**不读取/不信任**客户端上报的奖励数值（AC-14）
- 种子化 RNG 保证云端可复算（AC-13）

## 改动前必看

- **玩法主文档**：`specs/260608-pve-destiny-expedition/design.md`（任何规则/数值/AC 改动必须同步）
- **完整规则**：`.cursor/rules/pve-module.mdc`（节点池化、Diff 刷新、UI 命名约定、真机分包、云端校验细则）
- **历史背景**：memory `pve-module` 条目（注意：标注为"已部分过时"，以代码现状为准）

## 子模块速查

`core/`：
- `ExpeditionState.ts` — 编排（startExpedition/endTurn/advanceFloor/serialize/applyDeath）
- `PveConstants.ts` / `PveTypes.ts` — 常量与类型
- `FogSystem` / `MapGenerator` / `ApSystem` / `MovementSystem` — 探索与移动
- `CombatSystem` / `MonsterAI` / `bosses/` — 战斗
- `AnimaSystem` / `LootSystem` / `EquipmentSystem` / `ClassSystem` / `AchievementSystem` / `CampSystem` / `DestinyTreeSystem` — 元系统
- `FloorRules` / `NeutralEntities` / `Chapter1Monsters` — 关卡内容

`controllers/`：`ExpeditionController` / `DestinyTreeController`
`views/`：`FogMapView` / `PveHudView` / `PveToastView` / `PveCharacterPanel` / `PveMessageLog` / `DestinyTreeView` / `pveUiKit`
网络层：`assets/scripts/network/PveService.ts`
