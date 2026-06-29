# 03_Art — 美术规范模块（VSS 应用层）

> **关系声明**：自 VSS v1.0 起，**项目唯一视觉事实来源是 [`standards/Visual_Style_System/`](../Visual_Style_System/README.md)**。
> 本模块 (`03_Art/`) 是 VSS 的**应用速查层**：按类目（角色 / UI / Icon / Item / VFX 等）组织、便于历史链接保留与日常查询。
> 与 VSS 冲突时**以 VSS 为准**；本模块逐步演化为 VSS 的"应用摘要"，**不再独立增加新视觉规则**。

## Purpose

定义《命运之塔》全项目的统一视觉语言。本模块的目标是：**让任何 AI、任何画师、任何 pipeline 产出的资源，都属于同一套美术体系，无法被一眼看出"来自不同地方"。**

如果项目最终出现"玩家是 chibi、怪物是写实、Boss 是动漫"这种风格分裂，那是本模块的失败。

## Standards

### 3.0 模块清单

| 文件 | 范围 | 优先级 |
|------|------|--------|
| [`Character_Art_Guide.md`](Character_Art_Guide.md) | **角色总纲**：玩家 / 怪物 / Boss / NPC 全部 | ★★★（最高） |
| [`Environment_Art_Guide.md`](Environment_Art_Guide.md) | 场景 / 地图 / 背景 / Tile | ★★ |
| [`UI_Art_Guide.md`](UI_Art_Guide.md) | UI 整体视觉（背板、按钮、面板、装饰） | ★★★ |
| [`Item_Art_Guide.md`](Item_Art_Guide.md) | 武器 / 装备 / 卷轴 / 遗物 / 道具 | ★★ |
| [`Icon_Style_Guide.md`](Icon_Style_Guide.md) | 所有图标（HUD / 物品 / 技能 / 状态） | ★★★ |
| [`Color_System.md`](Color_System.md) | 全局调色板、稀有度色、状态色 | ★★★ |
| [`Material_Library.md`](Material_Library.md) | 表面材质语言（石、木、金属、布、皮、水晶等） | ★★ |
| [`Animation_Guide.md`](Animation_Guide.md) | 动作规范（待机、攻击、受击、死亡、UI 入场） | ★★ |
| [`VFX_Guide.md`](VFX_Guide.md) | 特效（攻击、技能、状态、UI 反馈） | ★★ |

### 3.1 三条不可破的元规则

> 若任何 03_Art 子规范与下列冲突，以下列为准。

1. **同一套视觉语言**：所有 03_Art 子规范的产物**必须**符合 `Character_Art_Guide.md` §2 定义的"PVE Fantasy v1"风格锚点。
2. **同一份风格锚图**：所有 AI Prompt 必须引用 `art_pipeline/references/pve-style-reference.png` 与 `art_pipeline/styles/pve_fantasy.json`。
3. **同一条 pipeline**：任何最终入库的资产都必须经过 `art_pipeline/` 的 `todo → generated → selected → processed → integrated` 流程，禁止旁路。

### 3.2 与其他模块的关系

| 模块 | 关系 |
|------|------|
| `04_AI/*Prompt_Template.md` | 直接消费本模块的 §2 风格锚点、§7 描边规范、§10 缩放可读性 |
| `05_UI/*` | UI 视觉细节归 `UI_Art_Guide.md`；UI 行为/布局归 `05_UI` |
| `08_Assets/*` | 资产命名、目录、导入参数；本模块只管"长什么样"，不管"叫什么名" |
| `art_pipeline/styles/pve_fantasy.json` | 是本模块 §2 的机器可读版本；二者必须一致 |

## Examples

### 正确
> "我要画一个 Boss。"
> AI：先读 `Character_Art_Guide.md` 全文 → 读 `Color_System.md` 的 Boss 色 → 读 `04_AI/Boss_Prompt_Template.md` → 引用 §2 锚点 + §7 描边 + §10 缩放规则生成 Prompt → 走 pipeline。

### 错误
> AI：直接写"暗黑写实哥特巨魔"→ 违反 3.1 R1 / R2 / R3。

## AI Notes

- 美术问题第一份要读的永远是 `Character_Art_Guide.md`，**不是**单独子文档。
- 角色相关的所有问题（怪物、Boss、NPC、玩家）一律走 `Character_Art_Guide.md`，不要分裂到多份文档。
- 图标 vs UI 边界：可被点击的视觉块归 `UI_Art_Guide.md` / `Button_Guide.md`；只表达信息的小图归 `Icon_Style_Guide.md`。

## Checklist

- [ ] 我已读 `Character_Art_Guide.md` §2 / §7 / §10
- [ ] 我已确认产物会符合 3.1 三条元规则
- [ ] 我已用 `art_pipeline/styles/pve_fantasy.json` 校对风格关键词
- [ ] 我已确认走 pipeline，不直接写 `assets/resources/art/**`
