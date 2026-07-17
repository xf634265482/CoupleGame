# 营地双区背包布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将营地命痕台、装备台改为双区网格背包，并让角色区以中文和经验进度条展示职业成长。

**Architecture:** 保持 `CampController` 作为唯一的网络编排层；把卡片网格、滚动容器、详情弹窗和中文展示封装在 `CampView`。所有操作继续复用既有档案接口，成功后使用云端返回的档案快照重绘。

**Tech Stack:** TypeScript、Cocos Creator 3.8.8（`Node`、`Graphics`、`ScrollView`、`Mask`、`Label`）、现有 PVE 云函数接口。

## Global Constraints

- UI 使用代码构建，不创建 prefab；Controller 只编排、View 只渲染。
- 仅 `LV` 可保留英文；玩家可见职业、命痕、装备、品质、槽位、状态和按钮必须是中文。
- 不修改 PVE 玩法数值、存档协议或云端校验。
- 固定头部、上半区、滚动下半区、底部按钮和详情弹窗不得相互遮挡或挤压；720 × 1280 竖屏下文字完整可读。
- 所有网络动作使用既有 `_busy` 守卫和成功后的档案快照刷新。

---

### Task 1: 提供营地界面所需的中文展示数据

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenDisplay.ts`
- Modify: `assets/scripts/pve/core/professions/ProfessionMastery.ts`
- Test: `test/pve/MinghenDisplay.test.ts`

**Interfaces:**
- Produces `formatMinghenCampDetail(id, level): string`，仅输出命痕中文名、`LV.<等级>`、效果和试炼，不输出 `M01` 等内部 ID。
- Produces `masteryProgressForXp(xp): { level: number; current: number; next: number | null; remaining: number; ratio: number }`，以 `PROFESSION_MASTERY_XP` 计算当前级区间与满级状态。

- [ ] **Step 1: 写失败测试**

```ts
import { formatMinghenCampDetail } from '../../assets/scripts/pve/core/minghen/MinghenDisplay';

it('formats camp detail without internal id', () => {
  expect(formatMinghenCampDetail('M06', 2)).not.toContain('M06');
  expect(formatMinghenCampDetail('M06', 2)).toContain('LV.2');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:pve -- MinghenDisplay.test.ts`

Expected: FAIL because `formatMinghenCampDetail` is not exported.

- [ ] **Step 3: 实现中文数据格式化与经验区间计算**

```ts
export function formatMinghenCampDetail(id: string, level: MinghenLevel): string {
  const definition = getMinghenDefinition(id);
  return `${definition.name}\nLV.${level}\n${getMinghenEffectText(id, level)}\n试炼：${definition.trial}`;
}

export function masteryProgressForXp(xp: number) {
  const level = masteryLevelForXp(xp);
  const current = PROFESSION_MASTERY_XP[level - 1] ?? 0;
  const next = PROFESSION_MASTERY_XP[level] ?? null;
  const remaining = next == null ? 0 : Math.max(0, next - xp);
  return { level, current, next, remaining, ratio: next == null ? 1 : Math.min(1, Math.max(0, (xp - current) / (next - current))) };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:pve -- MinghenDisplay.test.ts`

Expected: PASS.

### Task 2: 用双区网格和详情弹窗重建 CampView

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts`
- Modify: `assets/scripts/pve/controllers/CampController.ts`

**Interfaces:**
- Consumes `formatMinghenCampDetail`、`masteryProgressForXp`、`getFixedEquipmentDefinition` 和既有 `CampViewCallbacks`。
- Produces `onToggleMinghen(id)`、`onTrackMinghen(id)`、`onToggleEquipment(instanceId)`、`onManageEquipment(action, instanceId)` 回调，不改变控制器网络契约。

- [ ] **Step 1: 删除逐件选择状态与上下翻页操作**

移除 `_minghenIndex`、`_equipmentIndex` 以及“上一枚 / 下一枚 / 上一件 / 下一件”按钮；不再将内部 ID、英文品质或英文槽位放入 `_describe` 文本。

- [ ] **Step 2: 建立固定区与滚动区容器**

在 `CampView` 内为命痕台和装备台创建：摘要区、上方固定网格、下方 `ScrollView + Mask` 网格、独立底部操作区。命痕上方固定为 8 个卡槽，装备上方固定为五个中文槽位。卡片文字最多两行并使用 `Label.Overflow.SHRINK`；滚动区仅在其自身遮罩内渲染。

- [ ] **Step 3: 实现命痕卡片与详情弹窗**

每个命痕卡片显示中文名和 `LV.<等级>`。点击后打开居中详情弹窗：已装配条目提供“卸下、追踪、关闭”，库存条目提供“装配、追踪、关闭”；弹窗说明中只显示中文名、效果、试炼和中文追踪状态。

- [ ] **Step 4: 实现装备卡片与详情弹窗**

使用 `getFixedEquipmentDefinition` 转换装备名与中文槽位；以中文品质名和强化等级渲染卡片。详情弹窗提供“穿戴或卸下、强化、锁定或解锁、出售、关闭”，并对已穿戴、锁定或无效操作禁用对应按钮。操作通过原有回调提交。

- [ ] **Step 5: 重建角色区**

使用 `masteryProgressForXp` 绘制经验条与 `当前经验 / 下一级所需经验`、`还需 N 经验`；满级显示“已满级”。职业名和技法名使用中文映射，未解锁状态显示“未解锁”，只保留 `LV` 英文缩写。

- [ ] **Step 6: 审核触摸与布局边界**

面板和详情弹窗拦截自身触摸，背景点击只关闭详情或营地。每次切换分页销毁旧卡片和滚动节点；标题、分页、摘要、固定网格、滚动网格、底部按钮采用互不重叠的 y 区间。

### Task 3: 验证、文档与提交

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-camp-inventory-layout-design.md`
- Modify: `docs/superpowers/plans/2026-07-14-camp-inventory-layout.md`
- Test: `test/pve/MinghenDisplay.test.ts`

- [ ] **Step 1: 静态检查玩家文案**

Run: `rg -n "M[0-9]|W[0-9]|COMMON|FINE|RARE|EPIC|LEGENDARY|WARRIOR|ARCHER|RANGER| XP" assets/scripts/pve/views/CampView.ts`

Expected: no player-visible formatting string contains those internal英文标识；类型与内部映射允许保留。

- [ ] **Step 2: 运行 PVE 测试**

Run: `npm run test:pve -- MinghenDisplay.test.ts`

Expected: PASS.

- [ ] **Step 3: 手动 Cocos 验收**

在 720 × 1280 预览打开营地，分别检查满 8 命痕、满五槽装备、长命痕描述、长技法名和滚动背包：所有文字可见、卡片不重叠、滚动区不盖住固定区、详情弹窗的关闭和动作按钮始终可点击。

- [ ] **Step 4: 更新计划进度并提交**

Run: `git add assets/scripts/pve/views/CampView.ts assets/scripts/pve/controllers/CampController.ts assets/scripts/pve/core/minghen/MinghenDisplay.ts assets/scripts/pve/core/professions/ProfessionMastery.ts test/pve/MinghenDisplay.test.ts docs/superpowers/specs/2026-07-14-camp-inventory-layout-design.md docs/superpowers/plans/2026-07-14-camp-inventory-layout.md && git commit -m "feat: rebuild camp inventory layout"`
