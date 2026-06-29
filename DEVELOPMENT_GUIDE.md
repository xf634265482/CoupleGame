# DEVELOPMENT_GUIDE.md
> 开发规则与流程。**所有团队成员（包括 AI 助手）** 改代码前必读。

---

## 一、代码定位流程

### 优先级顺序（严格遵守）

```
1. 先查 PROJECT_NAVIGATION.md  → 定位系统和入口文件
2. 打开入口文件，顺调用链向下追踪
3. 需要理解完整链路 → 查 CALL_FLOW.md
4. 以上仍无法定位 → 才允许全局搜索（Grep）
```

**禁止的行为**：拿到需求后直接 `grep -r "关键词" .`，在 8 份同名文件里翻找。

### 定位示例

> **需求**：修改玩家攻击时的暴击伤害计算逻辑

1. 查 PROJECT_NAVIGATION.md → **01 战斗系统** → 入口 `CombatSystem.ts`
2. 打开 `CombatSystem.ts` → 找 `playerAttack()` → 找 `EquipTraitEffects` 调用点
3. 打开 `EquipTraitEffects.ts` → 找暴击词条 id（如 `CRIT_STRIKE`）→ 直接修改

整个过程不需要全局搜索。

---

## 二、修改规则速查

### PVE 系统修改

| 修改类型 | 入口文件 | 注意事项 |
|----------|---------|---------|
| 伤害数值 | `PveConstants.ts` | 改完同步 `design.md` |
| 攻击逻辑 | `CombatSystem.ts` | 测试：`npm run test:pve` |
| 怪物 AI | `MonsterAI.ts` | 不影响 Boss，Boss 在 `bosses/` 独立 |
| Boss 机制 | `bosses/{BossName}.ts` | 改完同步 `specs/game-design/Boss设计V1.md` |
| 新增怪物 | `Chapter{N}Monsters.ts` + `ChapterMonsterRules.ts` | 两处都要改 |
| 装备词条 | `EquipTraitEffects.ts` | Boss 专属词条在 `BossEquipTraitEffects.ts` |
| 强化词条 | `AnimaSystem.ts` + `StrengthenEffects.ts` | 49条词条全在这两个文件 |
| 职业 | `ClassSystem.ts` + `PveConstants.ts` | 数值在 Constants，逻辑在 System |
| 命运树 | `DestinyTreeSystem.ts` + `PveMeta.js`（云端）| 客户端预校验 + 云端权威 |
| 地图生成 | `MapGenerator.ts` | 修改后必须验证 AC-13 确定性 |
| 存档格式 | `ExpeditionState.ts` + `PveSave.js` | 需考虑旧存档兼容性 |
| UI 刷新 | 对应 `views/*.ts` | 只改渲染，不改状态 |
| 网络接口 | `PveService.ts` + `cloudfunctions/pve/index.js` | 两端都要改 |

### PVP 系统修改

| 修改类型 | 入口文件 |
|----------|---------|
| 战斗规则 | `cloudfunctions/common/CombatResolver.js` |
| 格子事件 | `cloudfunctions/common/CellResolver.js` |
| 商店逻辑 | `cloudfunctions/common/ShopResolver.js` |
| 棋盘布局 | `cloudfunctions/common/BoardGenerator.js` |
| 机器人 AI | `cloudfunctions/common/BotPlayer.js` |
| 客户端渲染 | `assets/scripts/game/board/BoardView.ts` |
| PVP 数值 | `cloudfunctions/common/constants.js` |

---

## 三、必须遵守的架构约束

### PVE 三层铁律

```
core/     → 零框架依赖（禁止 import 'cc'）
           零直接随机（禁止 Math.random()，只用 rng.ts）
           纯函数（入参 state → 返回新 state + events，不修改入参）

controller → 唯一的状态写入者
            唯一调用网络的地方
            负责事件回放，不持有任何渲染逻辑

views/    → 只读 state，只写 Label/Graphics
           不调用 core 函数，不发网络请求
```

**违反后果**：core 里 import cc → 单测无法运行；直接 Math.random() → 云端无法复算（破坏 AC-13）。

### 云函数同步规则

```
✅ 改 cloudfunctions/common/<file>.js
✅ 然后跑 node scripts/sync-cloud-common.js
❌ 绝对不能直接改 cloudfunctions/{login,game,room,match,pve,initDb,scheduler}/common/
```

改完 `common/` 忘记跑 sync → 下次 sync 会覆盖掉你的修改 → 代码静默丢失。

### 单一真相源规则

| 内容 | 权威文件 |
|------|---------|
| PVE 所有数值 | `PveConstants.ts` |
| PVP 所有数值 | `cloudfunctions/common/constants.js` |
| 云函数共享逻辑 | `cloudfunctions/common/` |
| PVE 设计规则 | `specs/260608-pve-destiny-expedition/design.md` |
| PVP 设计规则 | `specs/260529-combat-board-game-rework/design.md` |

**同一个数值只在一处定义**。如果发现两处定义同一个数值，以上表权威文件为准，删除副本。

---

## 四、修改后必做的检查

### 改了 PVE core 逻辑

```bash
npm run typecheck:game     # 主游戏客户端 TS 类型检查
npm run test:pve          # 跑 PVE 单元测试
```

重点检查：
- `MapGenerator` 测试（AC-13 确定性）
- `CombatSystem` 伤害边界值
- 涉及 Boss 的测试用例

### 改了云函数

```bash
npm run typecheck:game       # 先确保客户端调用面未漂移
npm run typecheck:cloud      # 再看 cloudfunctions/common 的静态问题
node scripts/sync-cloud-common.js   # 同步副本（必须）
cd cloudfunctions/common && npm test  # 跑云函数单测
```

### 改了 PVE 玩法（数值/机制）

1. 同步 `specs/260608-pve-destiny-expedition/design.md`
2. 如果改了 Boss 机制，同步 `specs/game-design/Boss设计V1.md`

### 改了 PVP 玩法（数值/机制）

同步 `specs/260529-combat-board-game-rework/design.md`

### 改了存档格式

检查 `ExpeditionState.resumeExpedition()` 的反序列化逻辑，确保旧存档数据仍可加载（字段缺失时提供默认值）。

---

## 五、常见陷阱与对策

### 陷阱 1：grep 到 8 份同名文件

```bash
# 错误：
grep -r "loadMeta" cloudfunctions/

# 正确：
grep "loadMeta" cloudfunctions/common/pve/PveMeta.js
# 或排除副本：
grep -r "loadMeta" cloudfunctions/ --glob '!cloudfunctions/*/common/**'
```

### 陷阱 2：在 view 里持有状态

```typescript
// 错误：
class PveHudView {
  private _currentHp = 0;  // 不要在 view 里维护游戏状态
}

// 正确：
class PveHudView {
  refresh(state: ExpeditionState) {
    this._hpLabel.string = String(state.player.hp);  // 每次从 state 读
  }
}
```

### 陷阱 3：在 core 里直接 Math.random()

```typescript
// 错误（破坏确定性，云端无法复算）：
const roll = Math.random();

// 正确：
const roll = state.floorState.rng.next();  // 使用 state 里的 rng 实例
```

### 陷阱 4：core 函数修改入参 state

```typescript
// 错误（引用相同对象，导致历史状态污染）：
function playerAttack(state: ExpeditionState, ...) {
  state.player.hp -= damage;  // 直接修改！
  return { state, events };
}

// 正确（深拷贝或结构展开）：
function playerAttack(state: ExpeditionState, ...) {
  const newPlayer = { ...state.player, hp: state.player.hp - damage };
  const newState = { ...state, player: newPlayer };
  return { state: newState, events };
}
```

### 陷阱 5：在 controller 里写玩法逻辑

```typescript
// 错误：ExpeditionController 里直接计算伤害
_tapAttack() {
  const damage = this._state.player.attack * 1.5;  // 逻辑不该在这里
}

// 正确：委托给 core
_tapAttack() {
  const { state, events } = playerAttack(this._state, targetPos);
  this._state = state;
  this._replayEvents(events);
}
```

### 陷阱 6：混淆两个「事件系统」

- `PveEvent[]`（`PveTypes.ts`）：core 函数返回的副作用数组，表示"这次操作发生了什么"，是**数据**。
- `EventBus`（`core/EventBus.ts`）：框架级发布订阅，用于跨场景/跨模块通知，是**通信机制**。

PVE 内部逻辑只用 `PveEvent[]`，不用 `EventBus`。

### 陷阱 7：以为 Boss 逻辑只在 bosses/ 目录

Boss 的狂暴 **HP 阈值检测**和**变体被击中副作用**都在 `CombatSystem.ts` 的 `resolveHit()` 里，不在 `bosses/` 里。

```
# 排查 Boss 行为时，这两处必须同时看：
assets/scripts/pve/core/CombatSystem.ts      ← resolveHit() 含阈值检测 + 变体副作用
assets/scripts/pve/core/bosses/{BossName}.ts ← 阈值触发后的状态变更（下一怪物回合）
```

### 陷阱 8：以为词条效果在 AnimaSystem 里触发

词条**写入** → `AnimaSystem.applyStrengthen()`  
词条**触发** → `CombatSystem.ts`（直接调用 `StrengthenEffects` 里的函数）

"词条没生效"的 Bug 去 `AnimaSystem.ts` 是找不到的，要去 `CombatSystem.ts`。

### 陷阱 9：灵气强化以为由 Controller 调用 addAnima

`addAnima` 在 **Core 内部**（`CombatSystem` → `LootSystem` → `AnimaSystem.addAnima`）调用并 push `STRENGTHEN_TRIGGERED` event，Controller 只消费这个 event 展示弹窗。

```typescript
// 错误理解：Controller 收到灵气事件后调用 addAnima
_replayEvents(events) {
  if (event.type === 'ANIMA_GAIN') addAnima(this._state, event.amount);  // 不需要
}

// 正确：addAnima 已在 Core 里完成，Controller 只需响应 STRENGTHEN_TRIGGERED
_replayEvents(events) {
  if (event.type === 'STRENGTHEN_TRIGGERED') this._showPicker(event.choices);
}
```

---

## 六、新功能开发流程

1. **查 PROJECT_NAVIGATION.md** — 确认影响哪些系统
2. **查 CALL_FLOW.md** — 理解相关调用链，找到注入点
3. **查 design.md** — 确认需求是否已在设计文档中定义
4. **修改 core 层** — 纯函数，加对应的 `PveEvent` 类型
5. **修改 controller 层** — 在 `_replayEvents` 里加新事件的 case
6. **修改 view 层** — 按事件更新渲染
7. **跑测试** — `npm run test:pve`
8. **同步文档** — 更新 design.md（如有玩法变更）

### 日常回归最小集合

不确定该跑什么时，默认执行：

```bash
npm run typecheck:game
npm run test:pve
```

如果改了 `cloudfunctions/common/`，再追加：

```bash
npm run typecheck:cloud
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test
```

说明：

- `tsconfig.json` 已收敛为主游戏默认检查入口
- `tsconfig.game.json` 是等价的显式主游戏入口，`npm run typecheck:game` 使用它
- 不要再默认跑根工程的历史全量类型噪音入口来判断是否可提交

---

## 七、全局搜索的正确使用

全局搜索只用于：
- 导航文档中没有覆盖的边缘系统
- 查找某个具体 event type 的所有消费方
- 确认某个常量被哪些文件引用

```bash
# PVE 客户端搜索（排除测试和 node_modules）：
grep -r "KEYWORD" assets/scripts/pve/ --include="*.ts"

# 云函数搜索（排除同步副本）：
grep -r "KEYWORD" cloudfunctions/common/ --include="*.js"

# 全项目 TS 搜索：
grep -r "KEYWORD" assets/scripts/ --include="*.ts"
```

**不要**把 `cloudfunctions/` 整个目录作为搜索范围，会命中 8 份重复文件。
