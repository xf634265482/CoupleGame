# 01_Game_Design — 玩法设计规范

## Purpose

定义《命运之塔》玩法层的**长期规范**：哪些设计可以做、哪些必须遵守的玩法原则、什么是命运之塔"该有的样子"。

> 单次迭代的细节走 `specs/<iter>/design.md`；跨迭代的玩法原则归本模块。

## Standards

### 1.0 模块清单

| 文件 | 范围 |
|------|------|
| [`Game_Overview.md`](Game_Overview.md) | 游戏总览 |
| [`Core_Gameplay.md`](Core_Gameplay.md) | 核心玩法循环 |
| [`Battle_System.md`](Battle_System.md) | 战斗系统 |
| [`Dungeon_System.md`](Dungeon_System.md) | 迷宫 / 格子系统 |
| [`Boss_Design.md`](Boss_Design.md) | Boss 设计原则 |
| [`Monster_Design.md`](Monster_Design.md) | 怪物设计原则 |
| [`Item_System.md`](Item_System.md) | 卷轴 / 遗物 / 装备 |
| [`Progression.md`](Progression.md) | 元进度（命运树）+ 章节进度 |
| [`Glossary.md`](Glossary.md) | 玩法术语表 |

### 1.1 与 specs/ 的边界

- 本模块：定义"应该长这样"的规则与原则（跨迭代稳定）
- `specs/`：定义"这一版具体长这样"的实现细节（单次迭代）
- 冲突时按"具体优先"：specs 描述的实现细节为准；但实现细节若违反本模块原则，必须先改 spec

## Checklist

- [ ] 玩法改动前读了对应子文档
- [ ] 改动不违反 `PROJECT_CONTEXT.md` 的 5 条 Pillar
- [ ] 涉及战斗 / Boss / 物品 / 迷宫 时同步 `specs/260608-pve-destiny-expedition/design.md`
