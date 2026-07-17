# Minghen Effect Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在楼层首通选择、营地和战斗角色面板中统一展示24枚命痕的名称、等级与真实效果，并让第7层只选择 Boss 装备。

**Architecture:** `MinghenCatalog.ts` 保存机制数据与 I/II/III 级玩家文案，新增纯函数 `MinghenDisplay.ts` 负责按当前副本数计算“获得后等级”和生成短/长展示文本。三个 UI 入口只消费该纯函数，控制器不再拼接内部 ID 或用试炼文本冒充效果。

**Tech Stack:** TypeScript 5.4、Cocos Creator 3.8.8、ts-jest、现有代码构建 UI。

## Global Constraints

- PVE core 保持零 Cocos 依赖；展示纯函数禁止导入 `cc`。
- 24枚命痕效果以 `specs/260712-pve-persistent-floor-progression/minghen-catalog.md` 的 I/II/III 条目为玩家语义权威源，并与 `MinghenEffects.ts` 的实际执行数值核对。
- 未知 ID 继续抛出 `UNKNOWN_MINGHEN`。
- 第1–6层首次 `PROGRESSION` 通关显示命痕选择；第7层只显示 Boss 装备选择。
- 不修改移动、攻击、AP、怪物 AI、楼层目标或云端奖励算法。
- 修改 PVE 玩法展示后同步永久逐层设计文档。

---

### Task 1: 完成24枚命痕的真实战斗桥接

**Files:**
- Create: `assets/scripts/pve/core/minghen/MinghenCombatBridge.ts`
- Modify: `assets/scripts/pve/core/PersistentCombatRules.ts`
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/professions/ProfessionActionSystem.ts`
- Modify: `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- Modify: `test/pve/MinghenEffects.test.ts`

**Interfaces:**
- Produces: `previewMinghenAttack(runtime, targetId, baseResolution)`，将增伤、穿甲、射程、减费写入正式攻击上下文。
- Produces: `applyMinghenAttackResult(runtime, result, targetBefore)`，结算状态、次生伤害、治疗、护盾与击杀效果。
- Produces: `previewMinghenMoveCost(runtime, observedCost)` 与 `applyMinghenTurnTransition(runtime)`。

- [ ] **Step 1: 为24枚命痕补充逐级行为测试**

以固定上下文覆盖 M01–M24，至少断言每枚 I 级主效果和 II/III 的差异；增伤/AP/护盾/状态/次生伤害分别断言最终 `ApplyResult` 或运行态资源，不只断言中间 flags。

- [ ] **Step 2: 运行测试确认当前未接入结果失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenEffects.test.ts`

Expected: 增伤、AP、护盾、扩散、引爆等最终态断言失败。

- [ ] **Step 3: 接入攻击前效果**

在 `playerAttack` 前用持久化 memory 计算 `BEFORE_ATTACK/BEFORE_HIT`，将 `damageMultiplierBonus` 加到 `damageMultiplier`、`armorPenetrationBonus` 加到 `armorPenetration`、`rangeBonus` 加到射程，并将 `apDelta` 限制为最多减1且最终攻击至少1 AP。

- [ ] **Step 4: 接入攻击后、移动与回合效果**

正式处理 `applyStatuses/secondaryDamageRatio/heal/shield/spiritGain/flags`；移动减费在提交前计算；临时 AP 在回合开始写入资源；每层一次与每回合一次继续写入 `MinghenTriggerMemory`。次生伤害使用 `MINGHEN_SECONDARY` 来源，禁止再次调用自身。

- [ ] **Step 5: 运行命痕与原战斗链测试**

Run: `npm run test:pve -- --runInBand test/pve/MinghenEffects.test.ts test/pve/PersistentCombatRules.test.ts test/pve/OriginalCombatChainContract.test.ts test/pve/MovementSystem.test.ts test/pve/ApSystem.test.ts`

Expected: 全部通过，原攻击/移动事件链不变。

### Task 2: 为命痕目录补齐三级正式效果

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenCatalog.ts`
- Modify: `test/pve/MinghenCatalog.test.ts`

**Interfaces:**
- Produces: `MinghenDefinition.effects: Record<MinghenLevel, string>`
- Consumes: `MinghenLevel` 与现有 `values/hooks/trial`。

- [ ] **Step 1: 写失败测试**

在 `MinghenCatalog.test.ts` 增加：遍历24枚命痕，断言 `effects[1..3]` 均为非空中文玩家文案；并固定校验 M03：I 级包含“4 AP”和“1层灼烧”，II 级包含“3 AP”，III 级包含“额外结算1层灼烧”。

```ts
test('all Minghen expose player-facing effects for levels I-III', () => {
  for (const entry of MINGHEN_CATALOG) {
    for (const level of [1, 2, 3] as const) {
      expect(entry.effects[level].trim().length).toBeGreaterThan(0);
    }
  }
  expect(getMinghenDefinition('M03').effects[1]).toContain('4 AP');
  expect(getMinghenDefinition('M03').effects[1]).toContain('1层灼烧');
  expect(getMinghenDefinition('M03').effects[2]).toContain('3 AP');
  expect(getMinghenDefinition('M03').effects[3]).toContain('额外结算1层灼烧');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenCatalog.test.ts`

Expected: TypeScript 报错 `Property 'effects' does not exist`。

- [ ] **Step 3: 扩展目录类型并录入正式文案**

给 `MinghenDefinition` 与构造器 `d(...)` 增加：

```ts
effects: Record<MinghenLevel, string>;
```

每枚命痕的三级文案逐条取自 `minghen-catalog.md` 对应标题下的 `I/II/III`，但要将“改为”“提高至”等省略主语的升级句展开成单独可阅读的完整效果。例如 M03 必须是：

```ts
{
  1: '最终 AP 消耗至少4的主动攻击施加1层灼烧。',
  2: '最终 AP 消耗至少3的主动攻击施加1层灼烧。',
  3: '最终 AP 消耗至少3的主动攻击施加1层灼烧；对已有灼烧的目标再次施加时，立即额外结算1层灼烧，每个目标每回合一次。',
}
```

所有文案必须写明门槛、层数、百分比、每回合/每目标限制；不得显示 `AFTER_HIT`、`value(0)` 等内部术语。

- [ ] **Step 4: 运行目录与效果测试**

Run: `npm run test:pve -- --runInBand test/pve/MinghenCatalog.test.ts test/pve/MinghenEffects.test.ts`

Expected: 两个测试套件全部通过。

- [ ] **Step 5: 只提交本任务文件**

```powershell
git add -- assets/scripts/pve/core/minghen/MinghenCatalog.ts test/pve/MinghenCatalog.test.ts
git commit -m "feat(pve): add leveled Minghen effect copy"
```

### Task 3: 新增命痕展示纯函数

**Files:**
- Create: `assets/scripts/pve/core/minghen/MinghenDisplay.ts`
- Create: `test/pve/MinghenDisplay.test.ts`

**Interfaces:**
- Produces: `minghenLevelAfterGrant(entry?: MinghenCollectionEntry): MinghenLevel`
- Produces: `formatMinghenChoice(id: string, entry?: MinghenCollectionEntry): string`
- Produces: `formatMinghenDetail(id: string, level: MinghenLevel): string`
- Consumes: `getMinghenDefinition`, `MINGHEN_COPY_REQUIREMENTS`、`MinghenCollectionEntry`。

- [ ] **Step 1: 写获得后等级与文本失败测试**

```ts
expect(minghenLevelAfterGrant(undefined)).toBe(1);
expect(minghenLevelAfterGrant({id:'M03',level:1,copies:1,trialCompleted:false})).toBe(2);
expect(minghenLevelAfterGrant({id:'M03',level:2,copies:3,trialCompleted:false})).toBe(2);
expect(minghenLevelAfterGrant({id:'M03',level:2,copies:3,trialCompleted:true})).toBe(3);
expect(formatMinghenChoice('M03')).toContain('余烬（M03）');
expect(formatMinghenChoice('M03')).toContain('4 AP');
expect(formatMinghenDetail('M03',2)).toContain('II级效果');
expect(formatMinghenDetail('M03',2)).not.toContain('升格试炼');
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `npm run test:pve -- --runInBand test/pve/MinghenDisplay.test.ts`

Expected: FAIL，无法解析 `MinghenDisplay`。

- [ ] **Step 3: 实现纯函数**

使用现有材料门槛 `{1:1,2:2,3:4}`；获得后副本数为 `(entry?.copies ?? 0) + 1`。只有副本数至少4且 `trialCompleted` 才预览 III 级，否则最高预览 II 级。

```ts
export function formatMinghenChoice(id:string, entry?:MinghenCollectionEntry):string {
  const definition=getMinghenDefinition(id);
  const level=minghenLevelAfterGrant(entry);
  const progress=`获得后 ${(entry?.copies??0)+1}/4份`;
  return `${definition.name}（${id}）\n${roman(level)}级：${definition.effects[level]}\n${progress}`;
}
```

`formatMinghenDetail` 只返回名称、ID、等级、标签和实际效果；试炼由调用方在需要的详情层单独追加，防止再次把试炼误当效果。

- [ ] **Step 4: 运行展示与装配测试**

Run: `npm run test:pve -- --runInBand test/pve/MinghenDisplay.test.ts test/pve/MinghenLoadout.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交纯函数与测试**

```powershell
git add -- assets/scripts/pve/core/minghen/MinghenDisplay.ts test/pve/MinghenDisplay.test.ts
git commit -m "feat(pve): add Minghen display formatter"
```

### Task 4: 首通奖励弹窗使用名称与获得后效果

**Files:**
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `test/pve/Chapter1RewardSources.test.ts`

**Interfaces:**
- Consumes: `formatMinghenChoice(id, flowState.profile.minghenCollection[id])`
- Preserves: `selectedMinghenId` 仍传 ID 给云端，不传展示文本。

- [ ] **Step 1: 增加奖励门槛纯断言**

将“第1–6层才选择命痕”的判断抽成模块内纯函数或可测试导出 `shouldOfferFirstClearMinghen(floor, mode, firstClear)`，测试：1–6首次进度通关为 true；第7层、重复通关、HUNT/TRIAL/PRACTICE 均为 false。

- [ ] **Step 2: 运行测试确认第7层当前错误**

Run: `npm run test:pve -- --runInBand test/pve/Chapter1RewardSources.test.ts`

Expected: 第7层断言失败，因为当前条件没有 `runtime.floor <= 6`。

- [ ] **Step 3: 替换弹窗标签与第7层条件**

```ts
if (firstProgressionClear && runtime.floor <= 6 && ids.length > 0 && this._toast) {
  const selected = await this._toast.showTreeChoice(
    `第 ${runtime.floor} 层首通奖励 · 选择主题命痕`,
    ids.map((id) => formatMinghenChoice(id, flowState.profile.minghenCollection[id])),
  );
  selectedMinghenId = ids[selected] ?? ids[0];
}
```

第7层继续只执行现有“选择酋长战利品”装备分支。

- [ ] **Step 4: 运行奖励来源和结算流程测试**

Run: `npm run test:pve -- --runInBand test/pve/Chapter1RewardSources.test.ts test/pve/PersistentFloorFlow.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交结算展示改动**

```powershell
git add -- assets/scripts/pve/controllers/ExpeditionController.ts test/pve/Chapter1RewardSources.test.ts
git commit -m "fix(pve): show Minghen effects in floor rewards"
```

### Task 5: 营地与角色面板复用同一效果

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts`
- Modify: `assets/scripts/pve/views/PveCharacterPanel.ts`
- Test: `test/pve/MinghenDisplay.test.ts`

**Interfaces:**
- Consumes: `formatMinghenDetail(id, level)` 与 `getMinghenDefinition(id).trial`。

- [ ] **Step 1: 扩充格式化测试覆盖营地和战斗详情**

断言详情包含 `余烬（M03）`、`II级效果`、实际效果，但试炼只能由显式 `includeTrial` 参数或调用方追加时出现。

- [ ] **Step 2: 运行测试确认旧面板仍显示 ID/试炼替代效果**

Run: `npm run test:pve -- --runInBand test/pve/MinghenDisplay.test.ts`

Expected: 新详情断言失败。

- [ ] **Step 3: 修改营地命痕区**

`CampView._describe('MINGHEN', profile)` 的当前选择改为：名称、等级、副本数、`formatMinghenDetail`、试炼；当前方案每行改为“名称 · I/II/III”，不再只列 ID。

- [ ] **Step 4: 修改战斗角色面板**

`PveCharacterPanel.showPersistent` 将当前 `definition.trial` 替换为 `formatMinghenDetail(entry.id, entry.level)`；点击命痕条目时详情再追加 `definition.trial`。如果现有面板无法为每条命痕提供点击节点，创建与装备行同样的透明可点击行，不改变底层战斗状态。

- [ ] **Step 5: 运行类型检查与展示测试**

Run: `npm run typecheck:game`

Run: `npm run test:pve -- --runInBand test/pve/MinghenDisplay.test.ts test/pve/MinghenCatalog.test.ts`

Expected: 类型检查和测试全部通过。

- [ ] **Step 6: 提交两处面板改动**

```powershell
git add -- assets/scripts/pve/views/CampView.ts assets/scripts/pve/views/PveCharacterPanel.ts test/pve/MinghenDisplay.test.ts
git commit -m "feat(pve): reuse Minghen effects across build views"
```

### Task 6: 同步设计并做完整回归

**Files:**
- Modify: `specs/260712-pve-persistent-floor-progression/design.md`
- Modify: `specs/260712-pve-persistent-floor-progression/chapter-1-content.md`

**Interfaces:**
- Documents: 第1–6层首通命痕、第7层仅 Boss 装备、统一效果文案源。

- [ ] **Step 1: 更新设计文档**

在 HUD/奖励 AC 中明确候选项显示名称与获得后等级效果；第7层不发命痕选择；营地和角色面板复用目录文案。

- [ ] **Step 2: 运行针对性回归**

Run:

```powershell
npm run test:pve -- --runInBand test/pve/MinghenCatalog.test.ts test/pve/MinghenDisplay.test.ts test/pve/MinghenEffects.test.ts test/pve/MinghenLoadout.test.ts test/pve/Chapter1RewardSources.test.ts test/pve/PersistentFloorFlow.test.ts
```

Expected: 所有套件通过。

- [ ] **Step 3: 运行游戏类型检查**

Run: `npm run typecheck:game`

Expected: 退出码0。

- [ ] **Step 4: 运行完整 PVE 回归并区分既有基线**

Run: `npm run test:pve -- --runInBand`

Expected: 本次涉及的命痕、第一章奖励与永久流程套件全部通过。

- [ ] **Step 5: 提交文档**

```powershell
git add -- specs/260712-pve-persistent-floor-progression/design.md specs/260712-pve-persistent-floor-progression/chapter-1-content.md
git commit -m "docs(pve): clarify Minghen reward presentation"
```
