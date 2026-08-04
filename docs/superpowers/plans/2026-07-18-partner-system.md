# Partner System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地伙伴系统：大厅底栏入口与养成面板、档案/快照/通关经验、六类主动技能统一执行框架、战斗 HUD 改版（伙伴按钮 + 角色上移 + 去星尘/职业标 + `蓄力 0`），严格保持「不占格、不 AI、不自动攻击、每场 1 只、每层 1 次」。

**Architecture:** 纯逻辑放在 `assets/scripts/pve/core/partner/`（Catalog / Progression / Trial / Teleport / SkillExecutor / BattleState）；永久数据经 `PveProfile` + `normalizeProfile` 软迁移；开局冻结进 `FloorChallengeConfigSnapshot`；战斗经 `usePartnerSkill` 分发并复用护盾/治疗/spirit/穿甲/临时 AP/移动减费；UI 为 `PartnerController`/`PartnerView` + `PveHudView`/`PveLobbyController` 接线。禁止伙伴进 `monsters[]`、禁止做成第二套命痕。

**Tech Stack:** Cocos Creator 3.8.8 TypeScript（`assets/scripts/pve`）、云函数 `cloudfunctions/common/pve`、Jest（`npm run test:pve` + `cd cloudfunctions/common && npm test`）。

## Global Constraints

- 伙伴不占棋盘、不参与 AI、不自动攻击、无独立 HP；视觉跟随仅 view 层。
- 每次远征携带 1 名；层内不可换；每层主动技能基础 1 次；仅玩家可操作阶段可用。
- 不做羁绊/好感/伙伴装备/技能树/抽卡/真实试炼关（`hasCompletedPartnerTrial` 首版恒 `true`）。
- 不抬 `PVE_PROFILE_VERSION`；软补全缺字段。
- 进化扣星尘 `gold`：50 / 200 / 500；门槛 Lv5 / Lv15 / Lv30。
- 通关经验：仅装备中伙伴获得 `30 + clearedFloor`。
- 改 `cloudfunctions/common/**` 后必须 `node scripts/sync-cloud-common.js`。
- 玩法变更同步 `specs/260608-pve-destiny-expedition/design.md`，并更新 `PROJECT_NAVIGATION.md` / `CALL_FLOW.md`。
- 命名 ID：`MOBILITY` | `GUARD` | `BREAKER` | `CONTROL` | `ANIMA` | `HEAL`。

---

## File Structure

| Path | Responsibility |
|---|---|
| `assets/scripts/pve/core/partner/PartnerTypes.ts` | ID / stage / progress / battle state 类型 |
| `assets/scripts/pve/core/partner/PartnerCatalog.ts` | 六伙伴阶段技能配置与文案 |
| `assets/scripts/pve/core/partner/PartnerProgression.ts` | XP、升级、进化校验与扣费纯函数 |
| `assets/scripts/pve/core/partner/PartnerTrial.ts` | 试炼接口（恒 true） |
| `assets/scripts/pve/core/partner/PartnerTeleport.ts` | 合法落点查询 + 无路径瞬移 |
| `assets/scripts/pve/core/partner/PartnerBattleFlags.ts` | 临时标记常量与读写 helper |
| `assets/scripts/pve/core/partner/PartnerSkillExecutor.ts` | `usePartnerSkill` 统一分发 |
| `assets/scripts/pve/core/partner/PartnerProfile.ts` | `createDefaultPartners` / `normalizePartners` |
| `assets/scripts/pve/controllers/PartnerController.ts` | 大厅伙伴面板控制器 |
| `assets/scripts/pve/views/PartnerView.ts` | 伙伴列表面板 UI |
| `test/pve/PartnerProgression.test.ts` | 养成单测 |
| `test/pve/PartnerSkillExecutor.test.ts` | 技能单测 |
| `test/pve/PartnerProfileMigrate.test.ts` | 档案迁移单测 |
| `cloudfunctions/common/pve/PvePartner.js` | 云端伙伴 normalize / evolve / equip helpers |
| Modify: `PveProgressionTypes.ts`, `PveProfile.js`, `PveProgression.js`, `PveChallenge*.js`, `PveProgressionService.ts`, `PersistentExpeditionRuntime.ts`, `ExpeditionController.ts`, `PveHudView.ts`, `PveLobbyController.ts`, `FogMapView.ts`, `MovementSystem.ts`（若复用格子合法性）, `CombatSystem.ts` / 攻击路径（破甲标记）, `SpiritBurstSystem.ts`（绝对灵气增量）, design/nav docs |

---

### Task 1: Partner 类型、目录与养成纯函数

**Files:**
- Create: `assets/scripts/pve/core/partner/PartnerTypes.ts`
- Create: `assets/scripts/pve/core/partner/PartnerCatalog.ts`
- Create: `assets/scripts/pve/core/partner/PartnerProgression.ts`
- Create: `assets/scripts/pve/core/partner/PartnerTrial.ts`
- Create: `assets/scripts/pve/core/partner/PartnerProfile.ts`
- Test: `test/pve/PartnerProgression.test.ts`

**Interfaces:**
- Produces:
  - `PARTNER_IDS`, `PartnerId`, `PartnerEvolutionStage`, `PlayerPartnerProgress`, `PartnersMap`
  - `getPartnerDefinition(id)`, `getStageSkillConfig(id, stage)`
  - `xpRequiredForLevel(level)`, `grantPartnerExp(progress, amount)`, `canEvolve(progress, gold)`, `evolvePartner(progress, gold)` → `{ progress, gold, ok, reason? }`
  - `hasCompletedPartnerTrial(partnerId, toStage): boolean`（恒 `true`）
  - `createDefaultPartners()`, `normalizePartners(raw): { partners, equippedPartnerId }`
  - Constants: `PARTNER_EVOLVE_STARDUST = [0, 50, 200, 500]`（index = target stage）, `PARTNER_EVOLVE_LEVEL = [0, 1, 5, 15, 30]`, `partnerClearExp(floor) = 30 + floor`

- [ ] **Step 1: Write the failing test**

```ts
import {
  createDefaultPartners,
  grantPartnerExp,
  canEvolve,
  evolvePartner,
  partnerClearExp,
  xpRequiredForLevel,
} from '../../assets/scripts/pve/core/partner/PartnerProgression';
import { normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import { hasCompletedPartnerTrial } from '../../assets/scripts/pve/core/partner/PartnerTrial';

describe('PartnerProgression', () => {
  it('defaults unlock all six and equip MOBILITY', () => {
    const { partners, equippedPartnerId } = createDefaultPartners();
    expect(Object.keys(partners).sort()).toEqual(
      ['ANIMA', 'BREAKER', 'CONTROL', 'GUARD', 'HEAL', 'MOBILITY'].sort(),
    );
    expect(equippedPartnerId).toBe('MOBILITY');
    expect(partners.MOBILITY).toEqual({ unlocked: true, level: 1, exp: 0, evolutionStage: 1 });
  });

  it('normalize fills missing partners without wiping existing', () => {
    const n = normalizePartners({ partners: { MOBILITY: { unlocked: true, level: 4, exp: 10, evolutionStage: 1 } }, equippedPartnerId: 'GUARD' });
    expect(n.partners.MOBILITY.level).toBe(4);
    expect(n.partners.HEAL.unlocked).toBe(true);
    expect(n.equippedPartnerId).toBe('GUARD');
  });

  it('grants clear exp and levels up', () => {
    let p = { unlocked: true, level: 1, exp: 0, evolutionStage: 1 as const };
    const need = xpRequiredForLevel(1);
    p = grantPartnerExp(p, need);
    expect(p.level).toBe(2);
    expect(p.exp).toBe(0);
    expect(partnerClearExp(3)).toBe(33);
  });

  it('evolves 1→2 at Lv5 costing 50 stardust', () => {
    const p = { unlocked: true, level: 5, exp: 0, evolutionStage: 1 as const };
    expect(canEvolve(p, 50).ok).toBe(true);
    const r = evolvePartner(p, 50);
    expect(r.ok).toBe(true);
    expect(r.progress.evolutionStage).toBe(2);
    expect(r.gold).toBe(0);
  });

  it('trial stub always true', () => {
    expect(hasCompletedPartnerTrial('BREAKER', 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:pve -- PartnerProgression.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

`PartnerTypes.ts` — export IDs and interfaces as in design §4.  
`PartnerCatalog.ts` — six entries with displayName（可用「位移伙伴」等占位名）、`stages[1..4].skill` 数值字段（range/shieldRatio/penRatio 等）。  
`PartnerTrial.ts`:

```ts
import type { PartnerId } from './PartnerTypes';
export function hasCompletedPartnerTrial(_partnerId: PartnerId, _toStage: 2 | 3 | 4): boolean {
  return true; // 正式试炼关卡测通后再接
}
```

`PartnerProgression.ts` — implement `xpRequiredForLevel(level) = 30 + level * 15`, `grantPartnerExp`（循环升级，cap level 99）, `canEvolve`/`evolvePartner`（校验 level、gold、trial、stage&lt;4）.  
`PartnerProfile.ts` — `createDefaultPartners` / `normalizePartners`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:pve -- PartnerProgression.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/partner test/pve/PartnerProgression.test.ts
git commit -m "feat(pve): add partner types, catalog, and progression helpers"
```

---

### Task 2: 档案字段 + 云端 normalize / 装备与进化 API

**Files:**
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts` — `PveProfile` 增加 `partners`, `equippedPartnerId`；`UpdateCampConfigurationRequest` 增加 `equippedPartnerId?`；`SettleFloorChallengeRequest` 可选不改（经验由服务端按 snapshot 结算）
- Modify: `cloudfunctions/common/pve/PveProfile.js` — default + normalize
- Create: `cloudfunctions/common/pve/PvePartner.js` — JS 镜像 evolve/equip/normalize（与 TS 数值一致）
- Modify: `cloudfunctions/common/pve/PveProgression.js` — `updateCampConfiguration` 接受 `equippedPartnerId`；`manageCamp` 增加 `type: 'PARTNER', action: 'EVOLVE', partnerId`
- Modify: `assets/scripts/network/PveProgressionService.ts` — 透传字段
- Test: `cloudfunctions/common/__tests__/PvePartner.test.js` + `test/pve/PartnerProfileMigrate.test.ts`
- Run: `node scripts/sync-cloud-common.js`

**Interfaces:**
- Consumes: Task 1 progression rules（JS 侧复制常量，勿 import TS）
- Produces: profile 永含 `partners` + `equippedPartnerId`；`manageCamp({ type:'PARTNER', action:'EVOLVE', partnerId })`；`updateCampConfiguration({ equippedPartnerId })`

- [ ] **Step 1: Write failing cloud + client migrate tests**

```js
// cloudfunctions/common/__tests__/PvePartner.test.js
const { normalizeProfile } = require('../pve/PveProfile');
const { evolvePartnerOnProfile, equipPartnerOnProfile } = require('../pve/PvePartner');

test('normalize soft-fills partners', () => {
  const p = normalizeProfile({ version: 1, highestUnlockedFloor: 1, highestClearedFloor: 0 });
  expect(p.equippedPartnerId).toBe('MOBILITY');
  expect(p.partners.HEAL.unlocked).toBe(true);
});

test('evolve deducts gold', () => {
  let p = normalizeProfile({ version: 1 });
  p.gold = 50;
  p.partners.MOBILITY.level = 5;
  p = evolvePartnerOnProfile(p, 'MOBILITY');
  expect(p.partners.MOBILITY.evolutionStage).toBe(2);
  expect(p.gold).toBe(0);
});
```

```ts
// test/pve/PartnerProfileMigrate.test.ts
import { normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
it('invalid equipped id falls back to MOBILITY', () => {
  const n = normalizePartners({ partners: {}, equippedPartnerId: 'NOPE' as any });
  expect(n.equippedPartnerId).toBe('MOBILITY');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement profile + PvePartner.js + Progression wiring**

`PveProfile.js` `createDefaultProfile` 增加：

```js
partners: createDefaultPartnersMap(), // 六只 unlocked/lv1/stage1
equippedPartnerId: 'MOBILITY',
```

`normalizeProfile` 返回时用 `normalizePartnersMap(value.partners, value.equippedPartnerId)` 覆盖。  
`resetCampInventory` **保留** partners（养成不随营地清仓；若现有 reset 语义是全清，则在注释中说明伙伴保留，并单测锁定）。

`PveProgression.js`:

```js
if (request.equippedPartnerId !== undefined) {
  next = equipPartnerOnProfile(next, request.equippedPartnerId);
}
// manageCamp:
if (request.type === 'PARTNER' && request.action === 'EVOLVE') {
  next = evolvePartnerOnProfile(profile, request.partnerId);
}
```

- [ ] **Step 4: sync + tests PASS**

```bash
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test -- PvePartner.test.js
npm run test:pve -- PartnerProfileMigrate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/PveProgressionTypes.ts assets/scripts/network/PveProgressionService.ts cloudfunctions/common/pve test/pve/PartnerProfileMigrate.test.ts
git commit -m "feat(pve): persist partner progress on profile with soft migrate"
```

---

### Task 3: 开局快照冻结伙伴 + 通关发经验

**Files:**
- Modify: `PveProgressionTypes.ts` — `FloorChallengeConfigSnapshot` 增加 `partnerId`, `partnerEvolutionStage`, `partnerLevel`
- Modify: `StartFloorChallengeRequest` 增加可选透传或由服务端从 profile 写入（**推荐服务端从 profile.equippedPartnerId 写入，客户端不可伪造更高 stage**）
- Modify: `cloudfunctions/common/pve/PveChallengeValidate.js` / `buildChallenge` 路径 — snapshot 写入伙伴字段
- Modify: settle CLEAR 路径 — `grantPartnerExp` 到 `profile.partners[snapshot.partnerId]`
- Modify: client bootstrap 读取 snapshot 构建 `PartnerBattleState`
- Test: cloud challenge build + settle XP；client 读取断言

**Interfaces:**
- Produces: `config.partnerId: PartnerId | null`, `partnerEvolutionStage`, `partnerLevel`
- On CLEAR: `profile.partners[id] = grantPartnerExp(..., 30 + floor)`

- [ ] **Step 1: Failing test — snapshot contains equipped partner; CLEAR grants 30+floor XP**

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement freeze + settle grant**（未装备则 `partnerId: null`，不发 XP）

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): freeze equipped partner into challenge and grant clear XP"
```

---

### Task 4: 瞬移原语 + BattleState + 统一执行器骨架（位移/守护/治疗）

**Files:**
- Create: `PartnerTeleport.ts`, `PartnerBattleFlags.ts`, `PartnerSkillExecutor.ts`
- Modify: `SpiritBurstSystem.ts` 增加 `addSpiritAmount(state, amount)`（ANIMA 下任务用，本任务可先加）
- Modify: `FloorChallengeState` / runtime 挂载 `partnerBattle?: PartnerBattleState`
- Test: `test/pve/PartnerSkillExecutor.test.ts`（先测 MOBILITY/GUARD/HEAL）

**Interfaces:**
- Produces:
  - `listTeleportCells(floor, from, range): Coord[]`
  - `applyTeleport(expedition, to): { expedition, events }` — 无路径；拒绝占格/禁入；触发落点进入效果（复用现有 enter-cell hook，若无则只更新 `player` 坐标并 emit `PLAYER_TELEPORT`）
  - `createPartnerBattleState(snapshot): PartnerBattleState`
  - `usePartnerSkill(ctx): PartnerSkillResult`
  - `ctx` 至少含：`runtime`, `expedition`/`floorState`, `partnerBattle`, `phase: 'PLAYER_INPUT' | ...`, `targetCell?`, `targetMonsterId?`

```ts
export type PartnerSkillResult =
  | { ok: true; partnerBattle: PartnerBattleState; runtime: /* same generic */; events: GameEvent[]; needCellTarget?: boolean; needEnemyTarget?: boolean }
  | { ok: false; reason: string };
```

- [ ] **Step 1: Write failing tests**

```ts
describe('PartnerSkillExecutor basic', () => {
  it('rejects when skill already used', () => { /* ... */ });
  it('MOBILITY stage1 teleports within 2 and sets skillUsed', () => { /* ... */ });
  it('GUARD stage1 grants 15% maxHp shield', () => { /* ... */ });
  it('HEAL stage1 heals 15% and clamps to maxHp', () => { /* ... */ });
  it('HEAL stage4 converts 50% overheal to shield capped 10%', () => { /* ... */ });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement teleport + executor handlers for MOBILITY/GUARD/HEAL**（阶段数值读 Catalog）

MOBILITY 觉醒危险落点：检查落点 terrain/预警标签（复用 floor 已有危险标记字段；若无预警区 API，则危险地形集合先用现有 trap/sand/lava 类 cell tags）。

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): add partner teleport and basic skill executor"
```

---

### Task 5: 破阵 / 控场 / 灵气技能 + 战斗钩子

**Files:**
- Modify: `PartnerSkillExecutor.ts` — BREAKER/CONTROL/ANIMA
- Modify: `PersistentExpeditionRuntime.ts` / `CombatSystem.ts` / 攻击结算 — 读取破甲标记、破绽、目标伤害减免
- Modify: 怪物移动 / 强制位移路径 — 缓域移速-1、强制位移 ±、Boss 上限
- Modify: `SpiritBurstSystem.activateSpiritBurst` 结束或 clear 路径 — 余响临时 AP / 回声护盾（用 `partnerBattle.flags`）
- Modify: 玩家回合开始 — GUARD 守成（护盾仍在 → +1 AP）、稳固窗口结束
- Test: 扩展 `PartnerSkillExecutor.test.ts` + 必要时 `PersistentExpeditionRuntime` 集成断言

**Interfaces:**
- Flags（string 常量）：`PARTNER_MOVE_COST_REDUCE_ONCE`, `PARTNER_GUARD_DISPLACE_REDUCE`, `PARTNER_GUARD_SHIELD_WATCH`, `PARTNER_BREAK_MARK:${monsterId}`, `PARTNER_BREAK_WOUND:${monsterId}`, `PARTNER_SLOW_DOMAIN:${monsterId}`, `PARTNER_ANIMA_ECHO`, `PARTNER_ANIMA_FULL_BURST_SHIELD`
- BREAKER：选敌；下一次玩家对该目标主动攻击 `armorPenetration += ratio`；命中后清标记并按阶段挂伤口/破绽
- CONTROL：对范围内敌人挂 `movePenalty: 1` 至其下一次行动结束；进化/觉醒按规格
- ANIMA：`addSpiritAmount` 按 max spirit 的 25%/35%；挂余响/回声 flag

- [ ] **Step 1: Failing tests for BREAKER pen, CONTROL move-1, ANIMA +spirit**

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement handlers + wire hooks in runtime/combat/move**（只在事件点读 flags，禁止每帧扫盘）

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): implement breaker, control, and anima partner skills"
```

---

### Task 6: ExpeditionController 接线 + 选格/选敌 aim 态

**Files:**
- Modify: `ExpeditionController.ts` — `_onPartnerSkill`, aim 模式，调用 `usePartnerSkill`，刷新 HUD
- Modify: `FogMapView.ts` — 高亮合法瞬移格 / 破阵可选敌人；伙伴视觉跟随节点（占位 sprite，parent 到玩家，不进 monsters）
- Modify: `PersistentExpeditionRuntime.startFloorRuntime` — 初始化 `partnerBattle` from snapshot
- Test: 纯逻辑已覆盖；本任务以手动清单 + 尽可能的 controller 级单测（若无 harness 则跳过 UI 测，保留 aim 合法格纯函数测）

**Interfaces:**
- `ExpeditionController` 新增回调/状态：`_partnerAim: null | { mode: 'CELL' | 'ENEMY'; partnerId }`
- 可操作阶段门闩与攻击按钮相同（`!_busy`、玩家回合、未结算）

- [ ] **Step 1: Add `listTeleportCells` unit test for occupied rejection**（若 Task4 已有可补边界）

- [ ] **Step 2–4: Wire controller + fog highlights + follower node; ensure partner never pushed to `monsters`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): wire partner skills into expedition input and fog view"
```

---

### Task 7: 战斗 HUD 改版

**Files:**
- Modify: `assets/scripts/pve/views/PveHudView.ts`

**Changes (exact):**
1. 移除/隐藏 `_goldLabel`（星尘）与 `_classBox`/`_classLabel`（职业标）在远征 HUD 的展示；`refresh` 不再写星尘/职业名到该处。
2. 将「角色」按钮从左下移到右上资源卡：与「目标」并列（原 classBox / gold 区域）。
3. 原「角色」位创建「伙伴」按钮：展示可用/已用；callback `onPartnerSkill`。
4. 蓄力文案：`蓄力 ${n} AP` → **`蓄力 ${n}`**（`refreshPersistentControls` / charge label）。
5. `PveHudCallbacks` 增加 `onPartnerSkill?: () => void`；增加 `setPartnerSkillState({ available, used, selecting })`。

- [ ] **Step 1: 改 HUD 并在编辑器/预览目视确认布局**（无截图单测则用回调存在性的轻量测或 typecheck）

- [ ] **Step 2: Run `npm run typecheck:game`（或项目惯用 typecheck）确保回调接线编译通过**

- [ ] **Step 3: ExpeditionController 传入 `onPartnerSkill` 与 refresh 状态**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pve): revise expedition HUD for partner skill and cleaner top bar"
```

---

### Task 8: 大厅底栏入口 + Partner 面板

**Files:**
- Create: `PartnerController.ts`, `PartnerView.ts`
- Modify: `PveLobbyController.ts` `_buildBottomNav` — 四键：排行榜 | 伙伴 | 远征 | 营地  
  当前三键 x：`-1.5, +0.5, +1.5` × navStep；改为 `-1.5, -0.5, +0.5, +1.5`，宽度可略缩（如 140）以免溢出。
- Modify: `PveProgressionService` — `updateCampConfiguration({ equippedPartnerId })`, `manageCamp` PARTNER EVOLVE
- 大厅跟随：在大厅角色节点旁挂轻量占位（有则挂；无独立角色立绘则在面板打开时展示大图即可，底栏旁小图标可选）

**PartnerView 首版内容：**
- 左列表六只：名、Lv、Stage、已装备角标
- 右详情：当前技能说明、下一阶段变化、经验条、进化条件（Lv + 星尘）、[装备][进化]

- [ ] **Step 1: Implement View + Controller open/close like Camp modal pattern**（参考 `_showCampModal`）

- [ ] **Step 2: Equip + Evolve 调用云接口后 `setProfile` 刷新**

- [ ] **Step 3: 底栏插入伙伴按钮并接线**

- [ ] **Step 4: Smoke — typecheck + 手动打开面板**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pve): add lobby partner entry and management panel"
```

---

### Task 9: 文档同步与总验收测试

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` — 新增「伙伴」专节（边界、携带、六类摘要、HUD、档案字段）
- Modify: `PROJECT_NAVIGATION.md` — 伙伴入口表行
- Modify: `CALL_FLOW.md` — 大厅伙伴 / 战斗释放调用链
- Modify: `docs/superpowers/specs/2026-07-18-partner-system-design.md` 状态 → 已落地（实现完成后）
- Test: 跑全量相关单测

- [ ] **Step 1: 更新 design.md / 导航 / 调用链**（写清硬边界与 HUD 改版）

- [ ] **Step 2: Run**

```bash
npm run test:pve -- Partner
node scripts/sync-cloud-common.js
cd cloudfunctions/common && npm test -- PvePartner
```

Expected: PASS

- [ ] **Step 3: 对照设计 §12 验收清单逐条打勾（文档内 checklist）**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document partner system in design and navigation"
```

---

## Self-Review (plan vs spec)

| Spec 要求 | Task |
|---|---|
| 大厅底栏入口（排行↔远征） | 8 |
| 面板装备/进化/列表详情 | 8 |
| 档案 + 软迁移 | 2 |
| 开局冻结 + 层内不可换 | 3 |
| 通关经验 30+floor | 3 |
| 四阶段 + 星尘 + 试炼 stub | 1–2 |
| 统一 usePartnerSkill | 4–5 |
| 六类技能 | 4–5 |
| 瞬移/选目标 | 4, 6 |
| 不占格不 AI | 6（断言 + Fog 跟随） |
| HUD 改版 | 7 |
| design/nav 同步 | 9 |
| 单测 | 1–5, 9 |

无 TBD 占位；试炼恒 true 已写明；XP/星尘数值已钉死。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-partner-system.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派一个新子代理，Task 间做审查，迭代快  

**2. Inline Execution** — 本会话用 executing-plans 按 Task 推进，设检查点  

Which approach?
