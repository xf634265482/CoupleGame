# Naming — 资产命名

## Purpose

资产命名总表，作为 `02_Programming/Naming_Convention.md` §5 的扩展与配套查询。

## Standards

### 1. 通用规则

- 全小写 + 下划线分隔；不允许空格 / 大写 / 中文
- 用语义而非"img1 / pic2"
- 版本后缀只允许 `_v2` `_v3` ...，作为新建版本而不是覆盖

### 2. 模式

| 类别 | 模式 | 示例 |
|------|------|------|
| HUD 图标 | `icon_hud_<name>.png` | `icon_hud_hp.png` |
| 物品图标 | `icon_item_<rarity>_<name>.png` | `icon_item_rare_key.png` |
| 技能图标 | `icon_skill_<element>_<name>.png` | `icon_skill_fire_blast.png` |
| 状态图标 | `icon_status_<name>.png` | `icon_status_burning.png` |
| 章节图标 | `icon_chapter_<n>.png` | `icon_chapter_2.png` |
| 怪物 | `monster_ch{n}_{tier}_<name>.png` | `monster_ch1_common_goblin.png` |
| Boss | `boss_ch{n}_<name>.png` | `boss_ch2_quicksand_scorpion.png` |
| 玩家 | `player_<variant>.png` | `player_default.png` |
| 道具图 | `item_<type>_<name>.png` | `item_weapon_oak_staff.png` |
| 背景 | `bg_<scope>.png` | `bg_lobby.png` `bg_pve_ch1.png` |
| Tile | `tile_<scope>_<name>.png` | `tile_floor_ch1.png` `tile_fog.png` |
| UI 按钮 | `btn_<scope>_<name>.png` | `btn_pve_attack.png` |
| UI 面板 | `panel_<scope>_<name>.png` | `panel_pve_reward.png` |
| BGM | `bgm_<scope>_<name>.m4a` | `bgm_ch1_main.m4a` |
| SFX | `sfx_<category>_<name>.m4a` | `sfx_battle_hit_light.m4a` |
| Prefab | 一律 `_prefab` 结尾，避免与 Scene 混淆 | `pve_hud_prefab.prefab` |

### 3. 不允许

- ❌ `tmp_xxx` `test_xxx` `final_xxx` `final_final_xxx`
- ❌ 中文文件名
- ❌ 大写 / 空格 / 特殊字符
- ❌ 没有类型前缀的散文件

## Examples

### 正确
```
assets/resources/art/ui/pve/map/icon_chest.png
assets/resources/art/ui/pve/hud/btn_pve_attack.png
assets/resources/art/monsters/monster_ch2_elite_poison_scorpion.png
```

### 错误
```
assets/resources/IMG_4321.png                  ❌ 无意义
assets/resources/怪物_v2_最终.png              ❌ 中文 + 怪后缀
assets/resources/art/Final_BOSS.PNG            ❌ 大写
```

## AI Notes

- AI 写入资产前必须检查名字是否冲突；冲突走 `_v2`
- 不允许在生成 Prompt 时让 AI "自己取个名字"

## Checklist

- [ ] 全小写 + 下划线
- [ ] 类型前缀正确
- [ ] 不冲突
- [ ] 不用 final / tmp
