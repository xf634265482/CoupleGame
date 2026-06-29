# Icon_Style_Guide — 图标规范

## Purpose

让所有图标（HUD / 物品 / 技能 / 状态 / 章节）在 32~128 px 范围内可读、风格一致。

## Standards

### 1. 图标分类

| 类型 | 尺寸 | 用途 |
|------|------|------|
| HUD Icon | 48~64 px | 血量 / 蓝量 / 行动按钮 |
| Item Icon | 80~106 px | 装备 / 卷轴 / 遗物（最常用） |
| Skill Icon | 80~96 px | 技能格 |
| Status Icon | 32~48 px | Buff / Debuff |
| Chapter Icon | 96~128 px | 章节入口 |

### 2. 视觉规则

- 圆形或圆角方形（80 px 圆角 12 px）底框
- 底框色 = Panel Dark `#1B1F26` 半透明
- 描边色 Charcoal Outline，粗细 4~6 px @ 512
- 主体居中，留 10% 透明边
- 单一主体，不在一个图标里塞两件事
- 主体必须可在 32 px 下识别身份

### 3. 颜色

- 主体配色按所在系统：物品 → 稀有度色；技能 → 元素色；状态 → 状态色
- 底框可按稀有度变色（外发光 +1 px）
- 禁止：渐变背景、霓虹光晕、3D 透视

### 4. 命名

- HUD：`icon_hud_<name>.png`
- 物品：`icon_item_<rarity>_<name>.png`
- 技能：`icon_skill_<element>_<name>.png`
- 状态：`icon_status_<name>.png`
- 章节：`icon_chapter_<n>.png`

详见 [`../08_Assets/Naming.md`](../08_Assets/Naming.md)。

## Examples

### 正确
> `icon_item_rare_key.png`：圆角方框 + 蓝色稀有底光 + 描边铜钥匙 + 居中 + 32 px 可识别

### 错误
> 一个图标里画一把剑挂在盾上挂着光环 → 主体不单一 / 32 px 模糊

## AI Notes

- 图标 Prompt 复用 `standards/04_AI/` 的当前模板与本文件约束，不再依赖已移除的 `art_pipeline` prompt 文件
- 不要让 AI 在图标上"加些装饰让画面丰富" — 装饰会让 32 px 时主体糊掉
- 复用现有 `assets/resources/art/ui/pve/map/icon_*` 的描边粗细做基准

## Checklist

- [ ] 主体在 32 px 下可识别
- [ ] 有描边 + 圆角底框
- [ ] 主色符合所属系统的色彩规则
- [ ] 命名符合 §4
