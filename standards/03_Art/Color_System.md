# Color_System — 全局色彩系统

## Purpose

锁定《命运之塔》全项目用色，让任何美术资产、UI、特效、文字色都从同一份调色板里取色，杜绝"每张图自己定色"。

## Standards

### 1. 三层结构

```
基础色（Base）    — 世界底色，所有资产都在此色系上构图
角色色（Role）    — 玩家 / 章节怪物 / Boss 色（见 Character_Art_Guide §12.2）
功能色（Function）— 稀有度、状态、危险、奖励、UI 强调
```

### 2. 基础色板（世界）

| 名称 | HEX | 用途 |
|------|-----|------|
| Sky Blue | `#4F8FE0` | 跨页面天空基底 |
| Ivory Light | `#EDE3CC` | 云层 / 浅色遗迹 |
| Warm Sandstone | `#D7A85B` | 暖砂岩 / 平台 |
| Soft Gold | `#D6AE55` | 金属铭饰 / 奖励元素 |
| Cyan Magic | `#5FB8C8` | 蓝青魔法 / 残光 / 玩家主色 |
| Amber Glow | `#E6A553` | 火光 / 奖励暖光 / NPC 暖意 |
| Deep Navy Charcoal | `#17243A` | 描边主色（见 VSS Baseline） |

### 3. 章节色（Chapter Palette）

| 章节 | 主调 | 强调点缀 |
|------|------|---------|
| 第 1 章 · 云暮塔庭 | Warm Sandstone + 柔和草绿 | Cyan Magic + 桃金夕照 |
| 第 2 章 · 日照秘境沙海 | Amber Glow `#E6A553` + 米白 `#EDE3CC` | Oasis Green `#5FB05C` + Cyan Magic `#5FB8C8` |
| 第 3 章 · 冰霜回廊 | 冷蓝 `#7FA8C9` + 银白 `#D6E2EA` | 冰青 `#A8E8F0` |
| 第 4 章 · 熔岩深层 | 焦褐 `#3B1F12` + 深蓝岩灰 `#2A2A2E` | 火橙 `#E0581E` + 危险红 `#D24B4B` |
| 第 5 章 · 命运终塔 | 哑金 `#C9A24D` + 米白 `#EDE3CC` | 命运紫 `#7A4FB5` |

### 4. 稀有度色（Rarity）

| 稀有度 | HEX | 用途 |
|--------|-----|------|
| Common | `#B8BEC2` | 普通装备 / 卷轴底框 |
| Uncommon | `#5FB05C` | 优秀 |
| Rare | `#4F8FE0` | 稀有 |
| Epic | `#9F6BD8` | 史诗 |
| Legendary | `#E6A553` | 传说（与 Amber Glow 共用） |
| Mythic | `#E04F4F` | 神话（章节终极遗物） |

### 5. 状态色（Status）

| 状态 | HEX | 用途 |
|------|-----|------|
| HP 红 | `#D24B4B` | 血量 / 受伤数字 |
| MP 蓝 | `#5FB8C8` | 蓝量（与 Cyan Magic 共用） |
| Buff 绿 | `#5FB05C` | 增益 / 治疗 |
| Debuff 紫 | `#9F6BD8` | 减益（与 Epic 共用） |
| 危险红 | `#E04F4F` | 警告 / Boss 预警 |
| 安全绿 | `#5FB05C` | 安全格 / 撤退 |

### 6. UI 中性色

| 名称 | HEX | 用途 |
|------|-----|------|
| Panel Dark | `#1B1F26` | 弹窗主背 |
| Panel Edge | `#3A3F4A` | 弹窗描边 |
| Text Primary | `#F0EAD8` | 主文字（米白，避免纯白） |
| Text Secondary | `#A8A496` | 次文字 |
| Text Disabled | `#5E5C56` | 禁用文字 |

## Examples

### 正确
> 新怪物用 Moss Green + Worn Wood + Cyan Magic accent → 与第 1 章基础色一致

### 错误
> 用 `#FF00FF`（霓虹紫）作为 Boss 主色 → 不在任何章节调色板内 / 违反 §3 / 违反 Character_Art_Guide §12.3

## AI Notes

- AI 不允许自创 HEX；只从本表选；如确需新色，写入对应章节扩展表。
- 章节切换时主调改变，但**描边色 / 文字色 / 稀有度色不变**，保持跨章节系统的一致性。
- UI 文字色绝不用纯白 `#FFFFFF`；用 Text Primary `#F0EAD8`。

## Checklist

- [ ] 我使用的颜色全部来自本表
- [ ] 角色主/辅/点缀色符合所在章节调色板
- [ ] UI 文字色用了米白而非纯白
- [ ] 描边色是 Charcoal Outline 而非纯黑
