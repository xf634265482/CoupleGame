# UI 资产命名规范（UI_NAMING_RULE）

> 生成日期：2026-06-16  
> 基于现有 `UiAssets.ts` 中已落地的命名方案（70+ 资产）整理，新资产必须遵循此规范。

---

## 一、目录结构规范

所有 UI 美术资源存放在 `assets/resources/art/ui/` 下，按系统/功能分子目录：

```
art/ui/
├── backgrounds/          # 全屏背景图（bg_xxx）
│   ├── bg_lobby          # 大厅
│   ├── bg_room           # 房间
│   ├── bg_board          # 棋盘
│   └── bg_settlement     # 结算
├── lobby/                # 大厅 UI 元件
├── room/                 # 房间 UI 元件
├── board/                # 棋盘系统
│   ├── cells/            # 棋盘格子图标
│   ├── buttons/          # 棋盘操作按钮
│   ├── panels/           # HUD/消息/弹窗面板
│   └── pawns/            # 棋子
├── settlement/           # 结算 UI 元件
├── icons/                # 全局通用图标（跨系统）
├── loading/              # 启动/加载 UI          ← 待新增
├── common/               # 通用弹窗/按钮          ← 待新增
├── pve/                  # PVE 远征系统（全部新建）← 待新增
│   ├── backgrounds/      # PVE 背景（各章主题）
│   ├── hud/              # HUD 按钮/面板
│   ├── map/              # 迷雾地图格子/图标
│   ├── panel/            # 角色面板/弹窗面板
│   ├── popup/            # 各类弹窗
│   ├── camp/             # 营地 UI
│   ├── equip/            # 装备槽位图标
│   ├── relics/           # 遗物图标
│   ├── icons/            # PVE 专属图标
│   └── destiny/          # 命运树节点/连接线
└── wx/                   # 微信专属素材（分享封面/图标）
```

---

## 二、命名规则

### 2.1 通用格式

```
{系统前缀}_{元素类型}_{语义描述}[_{变体后缀}]
```

**各部分说明：**

| 部分 | 规则 | 示例 |
|------|------|------|
| 系统前缀 | 简写，见下表 | `btn` `panel` `icon` `bg` `bar` |
| 元素类型 | 见下表 | `board` `lobby` `pve` |
| 语义描述 | 小写下划线，英文 | `player_ready` `ice_wall` |
| 变体后缀 | 可选，见下表 | `_9s` `_sm` `_selected` `_empty` |

### 2.2 系统前缀

| 前缀 | 含义 | 用于 |
|------|------|------|
| `bg_` | 背景（Background） | 全屏背景图 |
| `btn_` | 按钮（Button） | 所有可点击按钮 |
| `panel_` | 面板（Panel） | 弹窗/HUD/信息面板 |
| `bar_` | 条状（Bar） | 进度条/状态条/分隔条 |
| `card_` | 卡片（Card） | 玩家卡/商品卡/选项卡 |
| `icon_` | 图标（Icon） | 小图标（通常≤64px） |
| `tag_` | 标签（Tag） | 角色标签/身份标签 |
| `rank_` | 排名（Rank） | 结算排名徽章 |
| `frame_` | 边框（Frame） | 品质边框/奖励框 |
| `mark_` | 标记（Mark） | 地图叠加标记 |
| `line_` | 线（Line） | 连接线/分割线 |
| `tile_` | 地形格（Tile） | 地图格子地形 |
| `slot_` | 槽位（Slot） | 装备槽/玩家槽 |
| `node_` | 节点（Node） | 命运树节点 |
| `pawn_` | 棋子（Pawn） | 棋盘/房间内棋子 |
| `logo_` | Logo | 品牌Logo |
| `mask_` | 遮罩（Mask） | 半透明全屏遮罩 |
| `spinner_` | 旋转（Spinner） | 加载动画 |

### 2.3 变体后缀

| 后缀 | 含义 | 示例 |
|------|------|------|
| `_9s` | 九宫格（Sliced） | `panel_lobby_main_9s` |
| `_sm` | 小尺寸变体（Small） | `btn_pve_quit_sm` |
| `_lg` | 大尺寸变体（Large） | 如需要 |
| `_selected` / `_hover` | 选中/悬停状态 | `card_board_player_selected_9s` |
| `_empty` / `_filled` | 空/满状态 | `card_room_player_empty` |
| `_disabled` | 禁用态 | `btn_board_disabled_9s` |
| `_full` / `_dmg` | 完整/受损 | `tile_ice_wall_full` |
| `_warn` | 预警态 | `tile_lava_warn` |
| `_1` `_2` `_3` | 编号变体 | `pawn_player_1` |
| `_ch1` `_ch2` | 章节变体 | `bg_pve_ch1` |

---

## 三、已有资产命名清单（按规则验证）

### ✅ 完全符合规范的

```
# 背景
backgrounds/bg_lobby          ✅
backgrounds/bg_room           ✅
backgrounds/bg_board          ✅
backgrounds/bg_settlement     ✅

# 大厅
lobby/logo_game               ✅
lobby/panel_lobby_main_9s     ✅
lobby/btn_lobby_create_9s     ✅
lobby/btn_lobby_join_9s       ✅
lobby/btn_lobby_match_9s      ✅
lobby/input_lobby_name_9s     ✅  ← 注：input_ 前缀可保留，属特例

# 房间
room/panel_room_main_9s       ✅
room/card_room_player_empty   ✅
room/card_room_player_ready   ✅
room/tag_room_host            ✅

# 棋盘格子
board/cells/cell_normal       ⚠️  cell_ 前缀特例，在棋盘系统内合理
board/cells/cell_burning      ✅（在系统内）

# 棋盘按钮
board/buttons/btn_board_roll_9s     ✅
board/buttons/btn_board_attack_9s   ✅
board/buttons/btn_board_disabled_9s ✅

# 棋盘面板
board/panels/panel_board_hud_9s             ✅
board/panels/card_board_player_9s           ✅
board/panels/card_board_player_selected_9s  ✅
board/panels/bar_turn_status_9s             ✅

# 棋子
board/pawns/pawn_player_1~4   ✅
board/pawns/neutral_region_1  ✅

# 图标
icons/icon_weapon_sword       ✅
icons/icon_armor_helmet       ✅
icons/icon_shoes_marching     ✅
icons/icon_item_dice          ✅
icons/icon_status_infected    ✅
icons/icon_kill               ✅
icons/icon_warning            ✅

# 结算
settlement/panel_settlement_main_9s  ✅
settlement/rank_1~3                  ✅
settlement/tag_winner                ✅
settlement/btn_settlement_back_9s    ✅
```

### ⚠️ 需注意的命名

```
board/cells/cell_*    ← cell_ 为棋盘格子专属前缀，仅在 board/cells/ 目录下使用
                        PVE 地图格子用 tile_* 前缀（已区分）

board/panels/panel_board_guide_9s  ← guide 语义可换为 tutorial
```

---

## 四、新资产命名示例

### PVE HUD 按钮

```
pve/hud/btn_dpad_up              ← 方向键「上」（100×100，内部视觉箭头居中60×60）
pve/hud/btn_dpad_down            ← 方向键「下」
pve/hud/btn_dpad_left            ← 方向键「左」
pve/hud/btn_dpad_right           ← 方向键「右」
pve/hud/btn_pve_attack           ← 攻击按钮
pve/hud/btn_pve_interact         ← 交互按钮
pve/hud/btn_pve_end_turn         ← 结束回合
pve/hud/btn_pve_quit_sm          ← 返回（小）
pve/hud/btn_pve_char_sm          ← 角色（小）
pve/hud/btn_pve_scroll_sm        ← 卷轴（小）
pve/hud/bar_pve_info_9s          ← HUD信息条
```

### PVE HUD 数值图标（替换 emoji 用）

```
pve/icons/icon_hud_hp            ← HP图标（28×28，心形）
pve/icons/icon_hud_attack        ← 攻击力图标（28×28，剑形）
pve/icons/icon_hud_ap            ← AP行动点图标（28×28，闪电）
pve/icons/icon_hud_dice          ← 骰数图标（24×24）
pve/icons/icon_hud_gold          ← 金币（24×24）
pve/icons/icon_hud_anima         ← 灵气（24×24，紫色水晶）
pve/icons/icon_hud_key           ← 钥匙（24×24）
pve/icons/icon_hud_shards        ← 命运碎片（24×24）
pve/icons/icon_hud_scroll        ← 卷轴（28×28，卷轴按钮内嵌）
pve/icons/icon_status_burn       ← 灼烧状态（22×22）
pve/icons/icon_status_frozen     ← 冰冻状态（22×22）
pve/icons/icon_status_chill      ← 寒气层数（22×22，FrostGiant专属）
pve/icons/icon_crit              ← 暴击图标（22×22，橙黄色，接在伤害数字前）
pve/icons/icon_block             ← 格挡图标（22×22，蓝色盾形）
pve/icons/icon_boss_warn         ← Boss机制预警图标（24×24，叠加在危险Toast上）
```

### Boss 阶段切换横幅（轻量版）

```
pve/popup/panel_boss_phase_9s    ← Boss阶段切换横幅（640×88，九宫格，暗红色）
                                    ← 复用 icon_boss_warn 作为前缀图标
```

### PVE 职业图标

```
pve/class/icon_class_adventurer  ← 冒险者职业图标（64×64）
pve/class/icon_class_berserker   ← 狂战士职业图标（64×64）
pve/class/icon_class_archer      ← 射手职业图标（64×64）
pve/class/icon_class_rogue       ← 隐匿者职业图标（64×64）
pve/class/icon_awaken_berserker_a ← 狂战士觉醒型态A（64×64）
pve/class/icon_awaken_berserker_b ← 狂战士觉醒型态B（64×64）
pve/class/icon_awaken_archer_a   ← 射手觉醒型态A
pve/class/icon_awaken_archer_b   ← 射手觉醒型态B
pve/class/icon_awaken_rogue_a    ← 隐匿者觉醒型态A
pve/class/icon_awaken_rogue_b    ← 隐匿者觉醒型态B
pve/class/icon_fragment_berserker ← 职业碎片（32×32）
pve/class/icon_fragment_archer
pve/class/icon_fragment_rogue
```

### PVE 地图格子（⚠️ 章节变体命名）

```
pve/map/tile_fog                 ← 真雾遮罩（通用，半透明软雾）
pve/map/tile_floor_ch1           ← 战局背景·第1章（整张地图底图）← 注意：必须用 _ch1~ch5，不能 tile_floor
pve/map/tile_floor_ch2           ← 空地格·第2章（黄沙）
pve/map/tile_floor_ch3           ← 空地格·第3章（冻土）
pve/map/tile_floor_ch4           ← 空地格·第4章（熔岩底）
pve/map/tile_floor_ch5           ← 空地格·第5章（虚空）
pve/map/tile_rock                ← 岩石（第1章）
pve/map/tile_sand_pit            ← 沙坑（第2章）
pve/map/tile_ice_wall_full       ← 冰墙（满血）
pve/map/tile_ice_wall_dmg        ← 冰墙（受损）
pve/map/tile_ice_tile            ← 冰面（滑行）
pve/map/tile_freeze_wall         ← 冻结墙
pve/map/tile_shattered_ice       ← 碎冰
pve/map/tile_lava                ← 熔岩（永久）
pve/map/tile_lava_warn           ← 熔岩预警标记
pve/map/icon_player              ← 玩家图标
pve/map/icon_monster_normal      ← 普通怪
pve/map/icon_monster_elite       ← 精英怪
pve/map/icon_monster_anima       ← 灵魂怪
pve/map/icon_monster_boss        ← Boss
pve/map/icon_fate_mirror         ← 命运镜像
pve/map/icon_chest               ← 宝箱
pve/map/icon_exit                ← 出口
pve/map/mark_aoe_danger          ← AOE危险标记
pve/map/mark_frozen_cell         ← 冻结状态格
```

### PVE 面板/弹窗

```
pve/panel/panel_char_bg_9s               ← 角色面板背景
pve/panel/slot_equip_empty               ← 装备槽（空）
pve/panel/border_quality_common          ← 普通品质边框
pve/panel/border_quality_legendary       ← 传奇品质边框
pve/popup/panel_strengthen_9s            ← 强化选择弹窗
pve/popup/card_strengthen_option_9s      ← 强化选项卡片
pve/popup/panel_destiny_rewrite_9s       ← 命运改写弹窗
pve/popup/panel_floor_clear_9s           ← 层通关弹窗
pve/popup/panel_death_9s                 ← 死亡弹窗
pve/popup/panel_class_advance_9s         ← 职业进阶弹窗
pve/popup/panel_awaken_9s               ← 觉醒弹窗
pve/popup/card_awaken_form_9s           ← 觉醒形态卡片
pve/popup/panel_scroll_choice_9s         ← 卷轴词条选择
```

### 命运树

```
pve/destiny/node_locked                  ← 节点·未解锁
pve/destiny/node_available               ← 节点·可解锁
pve/destiny/node_unlocked               ← 节点·已解锁
pve/destiny/node_maxed                  ← 节点·满级
pve/destiny/node_icon_e1~e5            ← 各节点内图标
pve/destiny/line_node_h                 ← 横向连接线
pve/destiny/line_node_v                 ← 纵向连接线
pve/destiny/btn_unlock_9s              ← 解锁按钮
pve/destiny/bar_shards_9s             ← 碎片显示条
```

### 通用组件

```
common/popup/panel_confirm_9s           ← 通用确认弹窗
common/popup/btn_confirm_9s             ← 确认按钮
common/popup/btn_cancel_9s              ← 取消按钮
common/popup/panel_reward_9s            ← 奖励弹窗
common/popup/frame_reward_gold          ← 金色奖励框
```

---

## 五、禁忌命名（Bad Practices）

| ❌ 错误写法 | ✅ 正确写法 | 原因 |
|-----------|-----------|------|
| `button_attack` | `btn_pve_attack` | 缺系统前缀 |
| `BtnAttack` | `btn_pve_attack` | 禁止大驼峰 |
| `pve-hud-btn` | `btn_pve_attack` | 禁止中划线 |
| `攻击按钮` | `btn_pve_attack` | 禁止中文 |
| `btn_atk` | `btn_pve_attack` | 语义不完整 |
| `pannel_main` | `panel_main_9s` | 拼写错误 |
| `bg_pve_background` | `bg_pve_ch1` | 语义重复 |
| `icon_item` | `icon_relic_ch1` | 语义模糊 |
| `img_1` `img_2` | `tile_fog` `tile_floor` | 无意义编号 |
| `btn_board_new` | `btn_board_attack_9s` | 命名应描述功能，不描述新旧 |

---

## 六、Cocos 导入规则

### 6.1 SpriteFrame 导入路径

资源导入后，在 `UiAssets.ts` 的 `UI_SPRITE_UUID` 中登记 UUID：

```typescript
// 在 UiAssets.ts 中添加：
'pve/hud/btn_dpad_up': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@f9941',
```

获取 UUID 步骤：
1. 将图片拖入 Cocos 编辑器 `assets/resources/art/ui/pve/hud/`
2. 选中 SpriteFrame 子资源
3. 在属性检查器复制 UUID

### 6.2 九宫格配置

带 `_9s` 后缀的资源，导入后**必须**在 Cocos 中配置 Sliced 参数（Border Top/Bottom/Left/Right），然后提交 `.meta` 文件。

建议边距：
- 按钮：左右 20px，上下 16px
- 面板：四边 24px
- 小型面板/标签：四边 12px
- 进度条轨道：上下 8px，左右 6px

### 6.3 图集导入

TexturePacker 导出的 `.plist + .png` 图集：
- 存放在对应目录下（如 `pve/map/`）
- 命名为 `{系统}_{图集功能}.plist`（如 `pve_map_tiles.plist`）
- 图集内的子 SpriteFrame UUID 需逐一在代码中引用

---

## 七、美术交付检查清单

美术提交每一批资源前请确认：

**命名与规范**
- [ ] 所有文件名符合本规范（全小写下划线，英文，有语义）
- [ ] 九宫格资源名含 `_9s` 后缀
- [ ] 命名中无空格、无中文、无特殊字符
- [ ] PVE 战局背景已按章节命名（`tile_floor_ch1~ch5`，**禁止**使用 `tile_floor`）

**尺寸与输出**
- [ ] 出图倍率为 2×（设计稿 1px = 2 出图 px）
- [ ] PVE 方向键按钮出图 200×200（设计坐标 100×100，含安全触控区）
- [ ] PVE 地图格子统一出图 140×140（对应 70px 设计格 × 2）
- [ ] 分享封面为 **500×400**（非2×，直接交付；核心内容在中心460×360区域内）
- [ ] TexturePacker 图集不超过 2048×2048

**格式与大小**
- [ ] 所有背景图压缩后 < 150KB（JPG Q80 / WebP Q75）
- [ ] 所有图标/格子/按钮 < 20KB
- [ ] HUD 数值图标（替换emoji）均为 PNG 透明背景
- [ ] 透明通道图使用 PNG，无透明图优先 JPG/WebP

**按钮状态**
- [ ] 每个可被禁用的按钮提供正常态 + 禁用态两张（或确认用透明度代替禁用态）
- [ ] 通用按钮如使用透明度降低模拟禁用，只出一张正常态即可

**目录**
- [ ] 文件按目录结构整理，不混放
- [ ] 微信专属资源放 `wx/` 目录，不混入 `pve/` 或 `common/`
