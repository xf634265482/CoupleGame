# 职业叫法 · 机制 HUD · 蓄力撞碎 — 实施计划

> 规格：`docs/superpowers/specs/2026-07-16-profession-identity-hud-charge-design.md`（已确认）

## 任务顺序

1. **显示名**：统一 `战士 / 游侠 / 潜行者`（`CampView` + HUD/面板/Toast 的 classId 映射）
2. **WarriorSystem**：`CHARGE_BONUS` → ×1.00/1.40/1.75/2.10；蓄力击退 + 碰撞比例；扩展 `resolveWarriorKnockback`
3. **战斗链**：`playerAttack` 在命中后结算撞碎（位移 / Boss 震击 / 撞敌）
4. **HUD**：同一按钮按职切换蓄力 / 瞄准说明 / 连击·收招
5. **潜行者收招**：`commitRangerFinisher` + 免费 1 格移动
6. **文档 + 单测**：`profession-progression.md`、design 修订条、相关 jest

## 完成定义

见规格 §8–§9 验收清单。
