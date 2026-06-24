# Existing Asset Disposition V1

## Purpose

对现有 PVE 美术做 VSS v2.0 处置分类。此清单不删除、不覆盖、不切换引用，只决定后续评审优先级。

## Status Definitions

| 状态 | 含义 |
|------|------|
| KEEP-TECH | 技术结构或路径继续保留，视觉可能调整 |
| REVIEW | 需按 VSS v2.0 重新评审 |
| REMAKE | 已确认与新基线冲突，需版本化重制 |
| HISTORY | 仅作历史参考，不再用于新内容 |

## Group Disposition

### 战场

| 资产组 | 状态 | 原因 |
|--------|------|------|
| `map/tile_floor_ch1~ch5.png` | REMAKE | 新规则取消逐格完整实心地砖 |
| `map/tile_floor_ch1L.png` | HISTORY | 旧逐格地砖变体 |
| `map/tile_fog.png` | REMAKE | 需改为低饱和高遮蔽星雾 |
| `map/tile_selected_frame.png` | REVIEW | 需适配代码格线与新功能色 |
| `map/mark_move_range.png` | REVIEW | 需验证透明度与危险优先级 |
| `map/mark_attack_range.png` | REVIEW | 需统一珊瑚红/暖红攻击语义 |

### 玩家与地图实体

| 资产组 | 状态 | 原因 |
|--------|------|------|
| `map/icon_player.png` | REMAKE | 需要正式 Gold Standard 玩家与尺寸验证 |
| `map/icon_chest.png` | REVIEW | 方向接近，需适配新轮廓与层级 |
| `map/icon_key.png` | REVIEW | 方向接近，需验证青色晶体身份 |
| `map/icon_exit.png` | KEEP/REUSE | 使用 `icon_portal.png` 同款青色石拱门的 84×84 版本 |
| `map/icon_portal.png` | REVIEW | 需确认 Boss/普通传送门分级 |
| 祭坛/神像/铁匠/温泉 | REVIEW | 需统一交互物优先级 |
| 第一至第五章怪物/Boss | REVIEW | 章节映射和风格需逐章复评 |

### 背景

| 资产组 | 状态 | 原因 |
|--------|------|------|
| `backgrounds/bg_pve_ch1.png` | REMAKE | 需成为新背景 Gold Standard |
| `backgrounds/bg_pve_ch2~ch5.png` | REVIEW | 章节主题已重定，需要逐章验证 |
| `backgrounds/bg_pve_camp.png` | REVIEW | 后续阶段处理 |
| `backgrounds/bg_destiny_tree.png` | REVIEW | 后续阶段处理 |

### HUD 与 UI

| 资产组 | 状态 | 原因 |
|--------|------|------|
| `hud/bar_pve_info_9s.png` | REMAKE | 新 HUD 改为 A V4 多卡结构 |
| `hud/btn_pve_*.png` | REMAKE | 旧厚重按钮语言与新 UI 冲突 |
| `hud/bg_dpad.png` | HISTORY/REVIEW | 新规则为四枚独立方向键，不使用大十字底座 |
| `hud/btn_dpad_*.png` | REVIEW | 尺寸、箭头与轮廓需真机重评 |
| popup/panel/camp 9-slice | REVIEW | 骨架可保留，视觉需统一深海蓝绘制式面板 |
| HUD/状态图标 | REVIEW | 多数可能可保留，但需 32/48 px 和新轮廓检查 |
| class icons | REVIEW | 必须与新玩家职业身份同步 |

### 历史锚点与 Prompt

| 内容 | 状态 |
|------|------|
| `art_pipeline/references/pve-style-reference.png` | HISTORY |
| 旧 `pve_fantasy.json` Style Anchor | HISTORY / generation suspended |
| `standards/04_AI/*Prompt*` 旧内容 | HISTORY / suspended |

## Manifest Note

`art_pipeline/manifests/pve_ui.json` 当前 96 项均为 `integrated`。该字段只代表技术接入完成，不代表符合 VSS v2.0。

在用户逐批批准前，不批量改写 manifest 状态；VSS v2.0 处置状态以本文件为准。
