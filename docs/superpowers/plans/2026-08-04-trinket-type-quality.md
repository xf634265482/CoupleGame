# 饰品类型分化与品质阶段 Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** 饰品按灵气/幸运/财运三岔 + 品质阶段表分化；主数值统一为灵气%；废止饰品生命加成。

**Architecture:** `resolveTrinketStageEffects` + 改写 TRINKET 池；灵气%接入 `gainSpirit`/`addAnima`；幸运暴击接入 `CombatSystem`；财运星尘%接入 `LootSystem`；爆发回血在爆发激活处。

**Tech Stack:** TypeScript PVE core + Jest `test/pve`

## Global Constraints

- 权威：`docs/superpowers/specs/2026-08-04-trinket-type-quality-design.md`
- 同步 `design.md` + `equipment-catalog.md`
- 17 名保留；白绿无分支；永久层吃灵气%
- 饰品不再计入 maxHp

## File Map

| File | Role |
|---|---|
| `EquipmentSystem.ts` | implicit + 阶段表 + 鞋池式改写 TRINKET |
| `EquipmentProgression.ts` / `EquipmentDefinition.ts` | 去 maxHp；去 gold 假 spiritGain |
| `SpiritBurstSystem` / `PersistentCombatRules` / `AnimaSystem` | 灵气% |
| `CombatSystem.ts` | 暴击；击杀灵气 flat（或 Rules） |
| `LootSystem.ts` | 星尘% |
| `ExpeditionController.ts` | 爆发回血 |
| `pveEquipDetail.ts` | UI |
| `test/pve/TrinketStageEffects.test.ts` | 单测 |

---

### Task 1: 阶段表 + 目录

- [ ] 测试 + `resolveTrinketStageEffects` + 改写 17 件区间/implicit
- [ ] Commit

### Task 2: 接线

- [ ] 去 TRINKET maxHp；灵气% / 暴击 / 星尘% / 击杀灵气 / 爆发回血
- [ ] Commit

### Task 3: UI + 文档 + 回归

- [ ] 详情文案；design/catalog；`npx jest` 相关套件
- [ ] Commit
