# Chapter 1 Difficulty Pressure Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `2026-08-04-pve-difficulty-pressure-design.md` 加压第一章第 4–7 层（非堆血），并同步文档与单测。

**Architecture:** Catalog / AI / FloorRules / Runtime / GoblinChief 各自改真实生效的杠杆；`unobstructedEscapeTurns` 只作文档锚点，实际窗口由路径曼哈顿距离与 `messengerMove` 决定。波次冲锋改为按波读取步数，避免误伤其他章的固定 4 步全局常量。

**Tech Stack:** TypeScript PVE core（禁 `import 'cc'`）+ Jest `test/pve`。

## Global Constraints

- 设计权威：`docs/superpowers/specs/2026-08-04-pve-difficulty-pressure-design.md`
- 玩法改动同步：`specs/260712-pve-persistent-floor-progression/chapter-1-content.md`；触及全局口径再改 `specs/260608-pve-destiny-expedition/design.md`
- 第 1–3 层本轮不加压；怪物 HP 不作为主杠杆
- 不砍永久成长；不改体力规则
- 第 2–5 章本轮不改（除共享 API 必须保持向后兼容）

## File Map

| File | Role |
|---|---|
| `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts` | 第 4/5/6 层站位、special 锚点、绕路石块 |
| `assets/scripts/pve/core/objectives/Chapter1Objectives.ts` | 第 4 层目标文案强调逃离失败 |
| `assets/scripts/pve/core/FloorRules.ts` | 火药桶警报冲锋 2→3 |
| `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` | 波次冲锋步数按 floor/wave；第 6 层后半波编制加弓手 |
| `assets/scripts/pve/core/bosses/GoblinChief.ts` | 重击倍率 / 狂暴号角或普攻锋利度 |
| `assets/scripts/pve/views/CampView.ts` | 第 4/5 层情报文案如需对齐 |
| `test/pve/Chapter1Floor1to7.test.ts` / `FloorRules.test.ts` / 新增或扩展 Boss/wave 测 | 回归 |
| `specs/.../chapter-1-content.md` | 规则与 AC |

---

### Task 1: 第 4 层逃离窗口 + 截击位

**Files:**
- Modify: `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts`
- Modify: `assets/scripts/pve/core/objectives/Chapter1Objectives.ts`
- Modify: `test/pve/Chapter1Floor1to7.test.ts`
- Modify: `specs/260712-pve-persistent-floor-progression/chapter-1-content.md`（本节相关段落）

**背景：** 哨兵 `(1,6)` → 逃离 `(7,0)` 曼哈顿 12，每怪回合移 2 → 约 6 回合。目标约 4 回合 → 无阻挡路径曼哈顿约为 **8**（或等价组合）。`unobstructedEscapeTurns` 仅同步为 4。

- [ ] **Step 1: 写/改失败单测**

在 `Chapter1Floor1to7.test.ts` 将：

```ts
expect(d.special?.unobstructedEscapeTurns).toBe(6);
expect(distance).toBe(12);
```

改为期望 `unobstructedEscapeTurns === 4`，且 `distance / messengerMove === 4`（`messengerMove` 默认 2 → distance 8）。

- [ ] **Step 2: 跑测确认失败**

Run: `npx jest test/pve/Chapter1Floor1to7.test.ts -t "sentinel unobstructed" --no-cache`  
Expected: FAIL（仍为 6 / 12）

- [ ] **Step 3: 改 Catalog**

1. 缩短无阻挡路径到曼哈顿 8（优先移动 `ESCAPE_MARKER` / `criticalTargets[1]`，保持半围挡石块逻辑可用；若改 `escapeMarkerX/Y` 须与工厂一致）。
2. `special.unobstructedEscapeTurns: 4`。
3. 将 `f4_w2`（或等价 1 名战士）挪到短路径截击位（挡在哨兵→逃离主路径上，且不堵死玩家可达）。
4. 目标文案：`Chapter1Objectives` 第 4 层 description 写明「抵达闪烁逃离点即挑战失败」。

- [ ] **Step 4: 跑测通过 + 提交**

Run: `npx jest test/pve/Chapter1Floor1to7.test.ts test/pve/GoblinSentinel.test.ts test/pve/MonsterAI.test.ts -t "sentinel|floor 4|CHASE" --no-cache`  
Expected: PASS  

```bash
git add assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts assets/scripts/pve/core/objectives/Chapter1Objectives.ts test/pve/Chapter1Floor1to7.test.ts specs/260712-pve-persistent-floor-progression/chapter-1-content.md
git commit -m "feat(pve): tighten chapter1 floor4 chase pressure"
```

---

### Task 2: 第 5 层火药警报冲锋 + 绕路税

**Files:**
- Modify: `assets/scripts/pve/core/FloorRules.ts`（`activateGunpowderBarrel` 内 `rushMonstersTowardPlayer(..., 2)` → `3`）
- Modify: `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts`（爆破点前加可破坏石块；侧路弓手更近）
- Modify: `test/pve/FloorRules.test.ts`
- Modify: `chapter-1-content.md` §8

- [ ] **Step 1: 改 FloorRules 测**

将「冲 2 格」用例改为期望冲 **3** 格：距玩家曼哈顿 4 的怪应停在距玩家 1 的位置；已在射程仍当回合攻击。

- [ ] **Step 2: 实现冲锋 3 + Catalog 绕路/包夹**

```ts
const rush = rushMonstersTowardPlayer(alarmed, 3);
```

Catalog：在 `(4,0)` 爆破点南侧加 1 块可破坏石块（如 `(4,1)` 若未占用）；将 `f5_a2` 或侧路弓手向中路/玩家接近 1–2 格。不新增高血怪。

- [ ] **Step 3: 跑测 + 提交**

Run: `npx jest test/pve/FloorRules.test.ts -t "gunpowder" --no-cache`  
Expected: PASS  

```bash
git commit -m "feat(pve): raise floor5 barrel rush and path tax"
```

---

### Task 3: 第 6 层后半波 rush 5 + 弓手交叉

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts`（`waveRushSteps` 文档锚点可改为说明，或增加 `waveRushStepsLate: 5`）
- Create or modify: `test/pve/Chapter1WaveRush.test.ts`（或扩 `Chapter1Floor1to7.test.ts`）
- Modify: `chapter-1-content.md` §9

**要求：** 全局 `WAVE_SPAWN_RUSH_STEPS = 4` 仍作默认；**仅第 6 层 wave ≥ 3** 使用 5。其他章波次保持 4，避免误伤。

- [ ] **Step 1: 抽出步数函数并单测**

```ts
export function waveSpawnRushSteps(floor: number, wave: number): number {
  if (floor === 6 && wave >= 3) return 5;
  return WAVE_SPAWN_RUSH_STEPS;
}
```

所有 `rushMonstersTowardPlayer(..., WAVE_SPAWN_RUSH_STEPS` 在 wave spawn 路径改为传入 `waveSpawnRushSteps(floor, wave)`（含开局第一波 floor6 wave1 → 仍为 4）。

- [ ] **Step 2: 调整 `waveKindsForFloor` 第 6 层 wave 3–5**

在现有编制上至少再增加 1 名 `GOBLIN_ARCHER`（或把 1 名战士换成弓手），保持总数可控、不加工血。

- [ ] **Step 3: Catalog `special.waveRushSteps` 保持 4 作前半默认；可加 `waveRushStepsLate: 5` 供文档/测试读取**

- [ ] **Step 4: 跑测 + 提交**

```bash
git commit -m "feat(pve): late-wave rush pressure on chapter1 floor6"
```

---

### Task 4: 第 7 层 Boss 锋利度（不涨 HP）

**Files:**
- Modify: `assets/scripts/pve/core/bosses/GoblinChief.ts`
- Modify: 相关 `test/pve/MonsterAI.test.ts` 或 Boss 测
- Modify: `chapter-1-content.md` §10；Catalog `special` 若写死倍率则对齐

**改动：**

1. `HEAVY_STRIKE_MULTIPLIER`：`1.5 → 2.0`（内圈）；`HEAVY_STRIKE_OUTER_MULTIPLIER`：`1.5 → 1.75`（外圈略痛，仍鼓励躲掩体）。
2. 狂暴普攻：`boss.attack + 10` → `boss.attack + 15`（在 `MonsterAI` / `GoblinChief` 实际加攻处）。
3. `HORN_INTERVAL_ENRAGED` 保持 2（已够快）；不提高 `GOBLIN_CHIEF_SUMMON_CAP`。
4. **HP 660 / enrage 170 不动。**

- [ ] **Step 1: 改常量 + 更新断言重击伤害的测试**
- [ ] **Step 2: 跑 `npx jest test/pve/MonsterAI.test.ts -t "Goblin|Chief|heavy|号角" --no-cache` 及相关**
- [ ] **Step 3: 提交**

```bash
git commit -m "feat(pve): sharpen goblin chief heavy hit without HP stack"
```

---

### Task 5: 文档收尾 + 设计状态

**Files:**
- Modify: `specs/260712-pve-persistent-floor-progression/chapter-1-content.md`（汇总 4–7）
- Modify: `docs/superpowers/specs/2026-08-04-pve-difficulty-pressure-design.md` 状态 →「第一章试点已实现，待自测」
- Modify: `assets/scripts/pve/views/CampView.ts` 第 4/5 情报若仍写旧冲锋 2 格则改为 3

- [ ] **Step 1: 对照 design §6 逐条确认已实现**
- [ ] **Step 2: `npm run test:pve` 或至少跑本轮相关 jest 全绿**
- [ ] **Step 3: 提交 docs**

```bash
git commit -m "docs: sync chapter1 pressure pilot rules"
```

---

## Spec coverage checklist

| Spec 项 | Task |
|---|---|
| F4 窗口 6→4 + 截击 + 文案 | 1 |
| F5 冲锋 2→3 + 包夹/绕路税 | 2 |
| F6 后半 rush 5 + 弓手 | 3 |
| F7 重击/普攻锋利、不涨 HP | 4 |
| chapter-1-content / 设计状态 | 5 |
| 不改 F1–3 / 不辐射 2–5 章玩法 | 全局约束 |
