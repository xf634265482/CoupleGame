# UI 资产需求清单（UI_ASSET_LIST）

> 生成日期：2026-06-16  
> 画布规格：**720 × 1280**（竖屏 FIXED_WIDTH，超长屏向下扩展）  
> 出图规格：**1440 × 2560**（2×）  
> 美术资源存放路径：`assets/resources/art/ui/`（加载系统见 `UiAssets.ts`）  
> ✅ = 已有占位或正式美术 | ❌ = 完全缺失 | ⚠️ = 有占位但需替换

---

## 系统一览

| # | 系统 | 场景文件 | 美术完成度 | 优先级 |
|---|------|---------|-----------|-------|
| 1 | 启动/加载 | `bootstrap.scene` | ⚠️ 无 spinner | P1 |
| 2 | 大厅·菜单 | `lobby.scene` | ✅ 基本完成 | P2 |
| 3 | 大厅·房间 | `lobby.scene` | ✅ 基本完成 | P2 |
| 4 | 棋盘对战 | `board.scene` | ✅ 基本完成 | P2 |
| 5 | 棋盘结算 | `settlement.scene` | ✅ 基本完成 | P2 |
| 6 | **PVE 远征 HUD** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 7 | **PVE 迷雾地图** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 8 | **PVE 角色面板** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 9 | **PVE 营地** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 10 | **PVE 商店** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 11 | **PVE 弹窗系统** | `pve_expedition.scene` | ❌ 全部缺失 | **P0** |
| 12 | **命运树** | `destiny_tree.scene` | ❌ 全部缺失 | **P0** |
| 13 | 通用弹窗 | 跨场景 | ❌ 全部缺失 | P1 |
| 14 | 微信专属 | 跨场景 | ⚠️ 部分 | P1 |

---

## 1. 启动/加载（bootstrap.scene）

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 加载遮罩背景 | `loading/bg_loading` | 背景 | 全屏纯色或品牌色渐变 | ❌ |
| 游戏 Logo（大） | `loading/logo_splash` | 图标 | 启动首帧展示 | ❌ |
| Loading 进度条轨道 | `loading/bar_loading_track` | 进度条 | 九宫格横向拉伸 | ❌ |
| Loading 进度条填充 | `loading/bar_loading_fill` | 进度条 | 九宫格横向拉伸 | ❌ |
| Loading Spinner | `loading/spinner` | 动画图标 | 8 帧旋转动画或单张旋转 | ❌ |
| 版权文字底板 | `loading/text_copyright` | 装饰 | 可选 | ❌ |

---

## 2. 大厅·菜单（lobby.scene / MenuRoot）

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 大厅背景 | `backgrounds/bg_lobby` | 背景 | 720×1280 全屏，分包only | ✅ |
| 游戏 Logo | `lobby/logo_game` | 图标 | 520×180，非九宫格 | ✅ |
| 大厅主面板 | `lobby/panel_lobby_main_9s` | 面板 | 640×460，九宫格 | ✅ |
| 「命运远征」按钮 | `lobby/btn_lobby_create_9s` | 按钮 | 480×110，九宫格 | ✅ ⚠️ 复用，需专属版 |
| 「命运树」按钮 | `lobby/btn_lobby_match_9s` | 按钮 | 480×110，九宫格 | ✅ ⚠️ 复用，需专属版 |
| 对局名输入框 | `lobby/input_lobby_name_9s` | 输入框 | 九宫格 | ✅ |
| 命运碎片图标 | `icons/icon_destiny_shards` | 图标 | 40×40 | ❌ |
| 钻石图标 | `icons/icon_diamond` | 图标 | 40×40 | ✅ |

---

## 3. 大厅·房间（lobby.scene / RoomRoot）

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 房间背景 | `backgrounds/bg_room` | 背景 | 720×1280 全屏 | ✅ |
| 房间主面板 | `room/panel_room_main_9s` | 面板 | 920×560，九宫格 | ✅ |
| 玩家槽位（空） | `room/card_room_player_empty` | 卡片 | 280×172 | ✅ |
| 玩家槽位（已入） | `room/card_room_player_ready` | 卡片 | 280×172 | ✅ |
| 房主标签 | `room/tag_room_host` | 标签 | 含「房主」文字 | ✅ |
| 玩家棋子 1-4 | `board/pawns/pawn_player_1~4` | 棋子 | 88×88，各色/各型 | ✅ |
| 「开始游戏」按钮 | `lobby/btn_lobby_create_9s` | 按钮 | 复用大厅按钮 | ✅ ⚠️ |
| 「分享房间」按钮 | `lobby/btn_lobby_join_9s` | 按钮 | 复用 | ✅ ⚠️ |
| 「在线匹配」按钮 | `lobby/btn_lobby_match_9s` | 按钮 | 复用 | ✅ ⚠️ |
| 「解散/退出」按钮 | `lobby/btn_lobby_join_9s` | 按钮 | 复用 | ✅ ⚠️ |

---

## 4. 棋盘对战（board.scene）

### 4.1 背景与地图

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 棋盘背景 | `backgrounds/bg_board` | 背景 | ✅ |
| 普通格 | `board/cells/cell_normal` | 格子 | ✅ |
| 金币格 | `board/cells/cell_gold` | 格子 | ✅ |
| 钻石格 | `board/cells/cell_diamond` | 格子 | ✅ |
| 补给格 | `board/cells/cell_supply` | 格子 | ✅ |
| 废地格 | `board/cells/cell_waste` | 格子 | ✅ |
| 燃烧格 | `board/cells/cell_burning` | 格子 | ✅ |
| 事件格 | `board/cells/cell_event` | 格子 | ✅ |
| 金币商店格 | `board/cells/cell_gold_shop` | 格子 | ✅ |
| 传奇商店格 | `board/cells/cell_legendary_shop` | 格子 | ✅ |
| 最终商店格 | `board/cells/cell_final_shop` | 格子 | ✅ |
| 幸运格 | `board/cells/cell_lucky` | 格子 | ✅ |
| 区域边框 1-3 | `board/cells/cell_region_frame_1~3` | 装饰 | ✅ |

### 4.2 棋子与 HUD

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 玩家棋子 1-4 | `board/pawns/pawn_player_1~4` | 棋子 | ✅ |
| 中立区域标记 1-3 | `board/pawns/neutral_region_1~3` | 棋子 | ✅ |
| HUD 面板 | `board/panels/panel_board_hud_9s` | 面板 | ✅ |
| 玩家卡片（普通/选中） | `board/panels/card_board_player_9s` `card_board_player_selected_9s` | 卡片 | ✅ |
| 消息栏面板 | `board/panels/panel_board_message_9s` | 面板 | ✅ |
| 模态弹窗面板 | `board/panels/panel_board_modal_9s` | 面板 | ✅ |
| 引导面板 | `board/panels/panel_board_guide_9s` | 面板 | ✅ |
| Toast 面板 | `board/panels/panel_board_toast_9s` | 面板 | ✅ |
| 回合状态条 | `board/panels/bar_turn_status_9s` | 进度条 | ✅ |

### 4.3 棋盘按钮

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 投骰按钮 | `board/buttons/btn_board_roll_9s` | 按钮 | ✅ |
| 背包按钮 | `board/buttons/btn_board_bag_9s` | 按钮 | ✅ |
| 攻击按钮 | `board/buttons/btn_board_attack_9s` | 按钮 | ✅ |
| 帮助按钮 | `board/buttons/btn_board_help_9s` | 按钮 | ✅ |
| 结束回合按钮 | `board/buttons/btn_board_end_9s` | 按钮 | ✅ |
| 快速聊天按钮 | `board/buttons/btn_board_quick_chat` | 按钮 | ✅ |
| 禁用态按钮 | `board/buttons/btn_board_disabled_9s` | 按钮 | ✅ |

### 4.4 道具/装备图标（棋盘 & 背包）

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 武器·剑 | `icons/icon_weapon_sword` | 图标 | ✅ |
| 武器·枪 | `icons/icon_weapon_gun` | 图标 | ✅ |
| 武器·火箭筒 | `icons/icon_weapon_rocket` | 图标 | ✅ |
| 头盔 | `icons/icon_armor_helmet` | 图标 | ✅ |
| 护甲 | `icons/icon_armor_armor` | 图标 | ✅ |
| 行军靴 | `icons/icon_shoes_marching` | 图标 | ✅ |
| 急速靴 | `icons/icon_shoes_rapid` | 图标 | ✅ |
| 双骰子 | `icons/icon_item_dice` | 图标 | ✅ |
| 陷阱 | `icons/icon_item_trap` | 图标 | ✅ |
| 急救包 | `icons/icon_item_medkit` | 图标 | ✅ |
| 免疫药水 | `icons/icon_item_immunity` | 图标 | ✅ |
| 吸血石 | `icons/icon_item_vampire` | 图标 | ✅ |

### 4.5 状态图标（棋盘 HUD 角标）

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 击杀数 | `icons/icon_kill` | 图标 | ✅ |
| 感染 | `icons/icon_status_infected` | 图标 | ✅ |
| 悬赏 | `icons/icon_status_bounty` | 图标 | ✅ |
| 护符 | `icons/icon_status_amulet` | 图标 | ✅ |
| 危险警告 | `icons/icon_warning` | 图标 | ✅ |
| HP | `icons/icon_hp` | 图标 | ✅ |
| 在线 | `icons/icon_connected` | 图标 | ✅ |
| 金币 | `icons/icon_gold` | 图标 | ✅ |

---

## 5. 棋盘结算（settlement.scene）

| 元素名称 | 资源命名 | 类型 | 状态 |
|---------|---------|------|------|
| 结算背景 | `backgrounds/bg_settlement` | 背景 | ✅ |
| 结算主面板 | `settlement/panel_settlement_main_9s` | 面板 | ✅ |
| 排名 1/2/3 | `settlement/rank_1~3` | 图标 | ✅ |
| 胜利标签 | `settlement/tag_winner` | 标签 | ✅ |
| 淘汰标签 | `settlement/tag_defeated` | 标签 | ✅ |
| 「返回大厅」按钮 | `settlement/btn_settlement_back_9s` | 按钮 | ✅ |
| 「再来一局」按钮 | `settlement/btn_settlement_again_9s` | 按钮 | ✅ |

---

## 6. PVE 远征 HUD（pve_expedition.scene）❌ 全缺

> 当前实现：纯 `Graphics + Label` 占位。所有元素需重新制作美术版本。

### 6.1 背景与 HUD 框架

| 元素名称 | 资源命名 | 类型 | 说明 | 九宫格 |
|---------|---------|------|------|-------|
| PVE 背景·第1章 | `pve/backgrounds/bg_pve_ch1` | 背景 | 720×1280，地牢草石 | 否 |
| PVE 背景·第2章 | `pve/backgrounds/bg_pve_ch2` | 背景 | 沙漠主题 | 否 |
| PVE 背景·第3章 | `pve/backgrounds/bg_pve_ch3` | 背景 | 冰雪主题 | 否 |
| PVE 背景·第4章 | `pve/backgrounds/bg_pve_ch4` | 背景 | 熔岩主题 | 否 |
| PVE 背景·第5章 | `pve/backgrounds/bg_pve_ch5` | 背景 | 命运/虚空主题 | 否 |
| PVE 背景·营地 | `pve/backgrounds/bg_pve_camp` | 背景 | 营地主题 | 否 |
| HUD 顶部信息条 | `pve/hud/bar_pve_info_9s` | 面板 | 720×120，两行4列数值 | 是 |
| HUD AP 进度条轨道 | `pve/hud/bar_ap_track` | 进度条 | 可选增强显示 | 是 |
| HUD 方向键背景 | `pve/hud/bg_dpad` | 装饰 | 整体底盘装饰 | 否 |
| 方向键·上 | `pve/hud/btn_dpad_up` | 按钮 | **100×100**（含安全触控区） | 否 |
| 方向键·下 | `pve/hud/btn_dpad_down` | 按钮 | 100×100 | 否 |
| 方向键·左 | `pve/hud/btn_dpad_left` | 按钮 | 100×100 | 否 |
| 方向键·右 | `pve/hud/btn_dpad_right` | 按钮 | 100×100 | 否 |
| 攻击按钮 | `pve/hud/btn_pve_attack` | 按钮 | 110×60，红色 | 否 |
| 交互按钮 | `pve/hud/btn_pve_interact` | 按钮 | 110×60，蓝色 | 否 |
| 结束回合按钮 | `pve/hud/btn_pve_end_turn` | 按钮 | 110×60，灰色 | 否 |
| 返回大厅按钮（小） | `pve/hud/btn_pve_quit_sm` | 按钮 | 120×44 | 是 |
| 角色面板按钮（小） | `pve/hud/btn_pve_char_sm` | 按钮 | 120×44 | 是 |
| 卷轴使用按钮（小） | `pve/hud/btn_pve_scroll_sm` | 按钮 | 140×44，紫色，动态显隐 | 是 |

### 6.2 HUD 数值图标（⚠️ 替换 emoji，真机必须）

> 当前代码中 HUD 所有数值均用 emoji 拼接（❤️⚔️💰🔮🔑💎🔥🥶），苹果/安卓渲染风格完全不同。  
> 以下图标需全部制作，用于替换 emoji，统一使用自定义图标渲染。

| 元素名称 | 资源命名 | 尺寸 | 说明 |
|---------|---------|------|------|
| HP 图标（心形） | `pve/icons/icon_hud_hp` | 28×28 | HUD第一行，红色 |
| 攻击力图标（剑形） | `pve/icons/icon_hud_attack` | 28×28 | HUD第一行 |
| AP 图标（闪电/行动点） | `pve/icons/icon_hud_ap` | 28×28 | HUD第一行 |
| 骰子图标（HUD小） | `pve/icons/icon_hud_dice` | 24×24 | AP骰数显示 |
| 金币图标（HUD小） | `pve/icons/icon_hud_gold` | 24×24 | HUD第二行 |
| 灵气图标（HUD小） | `pve/icons/icon_hud_anima` | 24×24 | HUD第二行，紫色 |
| 钥匙图标（HUD小） | `pve/icons/icon_hud_key` | 24×24 | HUD第二行 |
| 命运碎片图标（HUD小） | `pve/icons/icon_hud_shards` | 24×24 | HUD第二行 |
| 灼烧状态图标 | `pve/icons/icon_status_burn` | 22×22 | 状态行，红橙色 |
| 冰冻状态图标 | `pve/icons/icon_status_frozen` | 22×22 | 状态行，冰蓝色 |
| 寒气层数图标 | `pve/icons/icon_status_chill` | 22×22 | FrostGiant专属 |
| 卷轴图标（HUD按钮内） | `pve/icons/icon_hud_scroll` | 28×28 | 卷轴副按钮内嵌 |
| 暴击图标 | `pve/icons/icon_crit` | 22×22 | 接在伤害数字前，橙黄色闪光 |
| 格挡图标 | `pve/icons/icon_block` | 22×22 | 接在"格挡"文字前，蓝色盾形 |
| Boss 机制预警图标 | `pve/icons/icon_boss_warn` | 24×24 | 叠加在危险型 Toast 上，红色骷髅/感叹号 |

---

## 7. PVE 迷雾地图（FogMapView）❌ 全缺

> 当前：汉字字符 + Graphics 色块占位。美术版本需要地图格子图集（TexturePacker 图集）。

### 7.1 地形格子（建议合并为一个图集 `pve/map/map_tiles.plist`）

> ⚠️ **章节主题色变体**：空地格按章节出 5 张独立图，key 分开（改美术不改代码）。  
> 其余专属地形格只在对应章节出现，按需制作。

| 元素名称 | 资源命名（图集内） | 类型 | 说明 | 章节 |
|---------|----------------|------|------|-----|
| 未探索·真雾遮罩 | `tile_fog` | 遮罩 | 半透明软雾，无边框，无硬格子感 | 全章 |
| 战局背景（第1章） | `tile_floor_ch1` | 背景 | 整张 8×8 哥布林林地营地背景，格子透明叠加 | Ch1 |
| 已探索·空地（第2章） | `tile_floor_ch2` | 格子 | 黄沙地面 | Ch2 |
| 已探索·空地（第3章） | `tile_floor_ch3` | 格子 | 冰雪冻土 | Ch3 |
| 已探索·空地（第4章） | `tile_floor_ch4` | 格子 | 玄武岩熔浆底 | Ch4 |
| 已探索·空地（第5章） | `tile_floor_ch5` | 格子 | 虚空能量地 | Ch5 |
| 岩石障碍 | `tile_rock` | 格子/图标 | 不可通行 | Ch1 |
| 沙坑 | `tile_sand_pit` | 格子 | 踩入AP+1 | Ch2 |
| 冰墙（满血） | `tile_ice_wall_full` | 格子 | 阻挡移动 | Ch3 |
| 冰墙（受损） | `tile_ice_wall_dmg` | 格子 | HP受损裂缝 | Ch3 |
| 冰面 | `tile_ice_tile` | 格子 | 滑行地形 | Ch3 |
| 冰冻墙 | `tile_freeze_wall` | 格子 | FrostGiant冰冻技能 | Ch3 |
| 碎冰 | `tile_shattered_ice` | 格子 | 冰墙被摧毁 | Ch3 |
| 熔岩格 | `tile_lava` | 格子 | 永久/临时 | Ch4 |
| 熔岩（临时预警） | `tile_lava_warn` | 格子 | 喷发预警标记 | Ch4 |
| 命运镜像格（占位） | `tile_fate_mirror` | 格子 | 第5章专属 | Ch5 |

### 7.2 实体图标（地图内叠加层，可合入地图图集）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 玩家图标 | `map/icon_player` | 图标 | 56×56，蓝色人形 |
| 普通怪物 | `map/icon_monster_normal` | 图标 | 56×56，红色 |
| 精英怪物 | `map/icon_monster_elite` | 图标 | 56×56，橙色 |
| 灵魂怪物 | `map/icon_monster_anima` | 图标 | 56×56，紫色 |
| Boss 图标 | `map/icon_monster_boss` | 图标 | 90×90（1.6×），深红 |
| 命运镜像 | `map/icon_fate_mirror` | 图标 | 56×56，紫色影形 |
| 宝箱 | `map/icon_chest` | 图标 | 48×48 |
| 钥匙 | `map/icon_key` | 图标 | 48×48 |
| 出口门 | `map/icon_exit` | 图标 | 48×48，绿色 |
| 传送门 | `map/icon_portal` | 图标 | 48×48，青色 |
| 铁匠铺 | `map/icon_blacksmith` | 图标 | 48×48 |
| 神像 | `map/icon_idol` | 图标 | 48×48 |
| 温泉 | `map/icon_hot_spring` | 图标 | 48×48 |
| 祭坛 | `map/icon_altar` | 图标 | 48×48 |
| 命运碎片 | `map/icon_fragment` | 图标 | 40×40 |

### 7.3 地图状态标记（叠加层）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| AOE 危险区域标记 | `map/mark_aoe_danger` | 叠加 | 红色半透明 |
| AOE 安全区域标记 | `map/mark_aoe_safe` | 叠加 | 绿色半透明 |
| AOE 预警标记 | `map/mark_aoe_warn` | 叠加 | 橙色半透明 |
| 攻击目标高亮 | `map/mark_attack_target` | 叠加 | 黄色描边 |
| 出口高亮 | `map/mark_exit_glow` | 叠加 | 绿色光晕描边 |
| Boss 护盾标记 | `map/mark_mirror_shield` | 叠加 | 蓝色护盾环 |
| 冰冻状态格 | `map/mark_frozen_cell` | 叠加 | 冰蓝色描边 |
| 冲锋预警方向 | `map/mark_charge_direction` | 叠加 | 红橙色箭头条 |

---

## 8. PVE 角色面板（PveCharacterPanel）❌ 全缺

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 角色面板背景 | `pve/panel/panel_char_bg_9s` | 面板 | 580×760，九宫格 |
| 全屏遮罩 | `pve/panel/mask_fullscreen` | 遮罩 | 纯黑半透明 |
| 装备栏格子（空） | `pve/panel/slot_equip_empty` | 格子 | 96×96 |
| 装备栏格子（已装） | `pve/panel/slot_equip_filled` | 格子 | 96×96，带品质色边框 |
| 品质边框·普通 | `pve/panel/border_quality_common` | 边框 | 96×96九宫格 |
| 品质边框·精良 | `pve/panel/border_quality_fine` | 边框 | 绿色 |
| 品质边框·稀有 | `pve/panel/border_quality_rare` | 边框 | 蓝色 |
| 品质边框·史诗 | `pve/panel/border_quality_epic` | 边框 | 紫色 |
| 品质边框·传奇 | `pve/panel/border_quality_legendary` | 边框 | 金色 |
| 关闭按钮 | `pve/panel/btn_close` | 按钮 | 44×44，「×」 |
| 词条标签背景 | `pve/panel/tag_trait_bg` | 标签 | 九宫格小胶囊 |
| 分区标题装饰线 | `pve/panel/divider_section` | 装饰 | 横线 |

### 装备槽位图标（PVE专属，需区别于棋盘系统）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 武器槽（无装备） | `pve/equip/slot_weapon_empty` | 图标 | 64×64 |
| 头盔槽（无装备） | `pve/equip/slot_helmet_empty` | 图标 | 64×64 |
| 护甲槽（无装备） | `pve/equip/slot_armor_empty` | 图标 | 64×64 |
| 靴子槽（无装备） | `pve/equip/slot_shoes_empty` | 图标 | 64×64 |
| 饰品槽（无装备） | `pve/equip/slot_trinket_empty` | 图标 | 64×64 |

---

## 9. PVE 营地（CampSystem）❌ 全缺

> 营地在击败章节Boss后进入，提供商店/铁匠/继续/返回。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 营地主面板 | `pve/camp/panel_camp_main_9s` | 面板 | 720×900，九宫格 |
| 营地标题装饰 | `pve/camp/title_camp` | 装饰 | 「营地」艺术字 |
| 商品卡片背景 | `pve/camp/card_shop_item_9s` | 卡片 | 160×200，九宫格 |
| 商品卡片（选中） | `pve/camp/card_shop_item_selected_9s` | 卡片 | 同尺寸，高亮边框 |
| 「购买」按钮 | `pve/camp/btn_buy_9s` | 按钮 | 140×52，九宫格 |
| 「卖出装备」按钮 | `pve/camp/btn_sell_9s` | 按钮 | 140×52 |
| 「继续远征」按钮 | `pve/camp/btn_continue_9s` | 按钮 | 480×96，主要CTA |
| 「返回大厅」按钮 | `pve/camp/btn_back_9s` | 按钮 | 240×72 |
| 「打开宝箱」按钮 | `pve/camp/btn_open_chest_9s` | 按钮 | 280×80，Boss专属遗物宝箱 |
| 金币图标 | `icons/icon_gold` | 图标 | 32×32，复用 |
| 钥匙图标 | `pve/icons/icon_key` | 图标 | 32×32 |
| 遗物图标占位 | `pve/icons/icon_relic_placeholder` | 图标 | 64×64 |

---

## 10. PVE 商店（铁匠铺、神像等中立实体交互）❌ 全缺

> 触发后弹出覆盖层，非单独场景。

### 10.1 铁匠铺交互（强化/重铸）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 交互弹窗面板 | `pve/popup/panel_interact_9s` | 面板 | 620×640，九宫格 |
| 「强化装备」选项条 | `pve/popup/row_upgrade_9s` | 列表项 | 580×72，九宫格 |
| 「重铸词条」选项条 | `pve/popup/row_reroll_9s` | 列表项 | 同上 |
| 「关闭」按钮 | `pve/popup/btn_close_sm` | 按钮 | 44×44 |
| 进度条（强化成功率） | `pve/popup/bar_success_rate` | 进度条 | 显示强化成功率 |

### 10.2 神像/温泉/祭坛确认弹窗（⚠️ 遗漏，重要）

> `useIdol`（回血消耗金币）、`useHotSpring`（免费回血）、`useAltar`（损血换金币）触发后  
> 必须有「代价→收益」确认弹窗，尤其祭坛为扣血操作，无确认弹窗会造成误操作投诉。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 神像确认弹窗 | `pve/popup/panel_idol_confirm_9s` | 面板 | 400×300，含图标+代价+收益说明 |
| 温泉确认弹窗 | `pve/popup/panel_hot_spring_9s` | 面板 | 400×280，免费操作也需提示 |
| 祭坛确认弹窗 | `pve/popup/panel_altar_confirm_9s` | 面板 | 400×300，⚠️ 损血操作，需要醒目提示 |
| 实体名称标题装饰 | `pve/popup/title_interact_bg` | 装饰 | 可三个弹窗复用，含名称艺术字槽 |

---

## 11. PVE 弹窗系统（PveToastView）❌ 全缺

### 11.1 Toast 条（战报/拾取/事件通知）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| Toast 背景条 | `pve/toast/bg_toast_9s` | 面板 | 520×64，九宫格 |
| Toast（危险型） | `pve/toast/bg_toast_danger_9s` | 面板 | 红色变体 |
| Toast（奖励型） | `pve/toast/bg_toast_reward_9s` | 面板 | 金色变体 |

### 11.2 三选一强化弹窗（灵气满100触发）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 强化选择面板 | `pve/popup/panel_strengthen_9s` | 面板 | 620×640 |
| 选项卡片（可选） | `pve/popup/card_strengthen_option_9s` | 卡片 | 180×240 |
| 选项卡片（悬停） | `pve/popup/card_strengthen_hover_9s` | 卡片 | 180×240，高亮版 |

### 11.3 命运改写弹窗（FateGuardian Boss 技能）

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 命运改写面板 | `pve/popup/panel_destiny_rewrite_9s` | 面板 | 620×720 |
| 命运词条卡片 | `pve/popup/card_destiny_9s` | 卡片 | 170×220 |
| 标题装饰 | `pve/popup/title_destiny_rewrite` | 装饰 | 艺术字标题 |

### 11.4 层结算弹窗

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 层通关面板 | `pve/popup/panel_floor_clear_9s` | 面板 | 620×560 |
| 死亡结算面板 | `pve/popup/panel_death_9s` | 面板 | 620×720（扩高，含广告按钮） |
| 「看广告复活」按钮 | `pve/popup/btn_revive_ad` | 按钮 | 400×72，带视频图标+「复活」文案，死亡弹窗内最高CTR位置 |
| 职业进阶面板 | `pve/popup/panel_class_advance_9s` | 面板 | 580×640 |
| 卷轴选词条弹窗 | `pve/popup/panel_scroll_choice_9s` | 面板 | 620×600 |

### 11.5 职业觉醒弹窗

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 觉醒形态选择面板 | `pve/popup/panel_awaken_9s` | 面板 | 620×700 |
| 觉醒形态卡片 | `pve/popup/card_awaken_form_9s` | 卡片 | 260×360 |

### 11.6 成就解锁通知条（⚠️ 遗漏）

> AchievementSystem 已实现成就检测，但完全没有 UI 反馈。成就解锁时需从屏幕顶部滑入横幅条。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 成就解锁横幅底板 | `common/popup/banner_achievement_9s` | 面板 | 640×72，顶部滑入 |
| 成就图标框 | `common/popup/frame_achievement` | 边框 | 48×48，金色六边形 |
| 标题装饰（「成就解锁」） | `common/popup/label_achievement_title` | 装饰 | 艺术字，可内嵌文字 |

### 11.7 Boss 登场过渡（⚠️ 遗漏）

> 进入第 5/10/15/20/25 层时，完全没有 Boss 登场仪式，体验缺失明显。  
> 至少需要全屏暗化 + Boss 名称文字飞入，无需复杂立绘。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| Boss 登场遮罩 | `pve/popup/mask_boss_intro` | 遮罩 | 全屏黑红渐变，720×1280 |
| Boss 名称背景条 | `pve/popup/panel_boss_name_9s` | 面板 | 640×80，暗金色 |
| Boss 章节标记装饰 | `pve/popup/deco_boss_chapter` | 装饰 | 左右对称装饰纹，各60×40 |

### 11.8 Boss 阶段切换横幅（轻量版）

> 方案：不做独立 Boss 面板，仅在阶段切换时发一条全屏危险 Toast 横幅。  
> 代码端只需在 `ExpeditionController.ts` 的 Boss 阶段判断处调用 `PveToastView.showDanger()`，传入横幅内容。  
> 美术只需一张比危险 Toast 更宽更高的横幅底板。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| Boss 阶段切换横幅底板 | `pve/popup/panel_boss_phase_9s` | 面板 | 640×88，九宫格；暗红色，比普通 Toast 更醒目 |

> 触发时机（代码侧）：GoblinChief 50% HP 进入狂暴、FrostGiant 第二形态、LavaLord 熔岩觉醒、FateGuardian 阶段3狂暴改写命运。  
> 文案格式：`[Boss名] · 阶段X · 技能描述`，无需额外图标，复用 `icon_boss_warn`。

### 11.9 退出确认弹窗（⚠️ 遗漏）

> HUD 「返回」按钮触发，需展示「进度将保存至第 X 层」的说明，比通用确认弹窗内容更重。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| PVE 退出确认面板 | `pve/popup/panel_quit_confirm_9s` | 面板 | 560×380，比通用弹窗高，含进度说明区 |

---

## 12. 命运树（destiny_tree.scene）❌ 全缺

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 命运树背景 | `pve/backgrounds/bg_destiny_tree` | 背景 | 720×1280，星空/宇宙风 |
| 树主面板 | `pve/destiny/panel_tree_main_9s` | 面板 | 全屏覆盖 |
| 节点·未解锁 | `pve/destiny/node_locked` | 图标 | 80×80 |
| 节点·可解锁 | `pve/destiny/node_available` | 图标 | 80×80，发光边框 |
| 节点·已解锁 | `pve/destiny/node_unlocked` | 图标 | 80×80，点亮状态 |
| 节点·最大级 | `pve/destiny/node_maxed` | 图标 | 80×80，金色 |
| 节点连接线 | `pve/destiny/line_node_connect` | 装饰 | 九宫格横线 |
| 「解锁」按钮 | `pve/destiny/btn_unlock_9s` | 按钮 | 200×64 |
| 「返回」按钮 | `pve/destiny/btn_back_9s` | 按钮 | 160×56 |
| 命运碎片显示条 | `pve/destiny/bar_shards_9s` | 面板 | 240×48，九宫格 |
| 节点信息弹窗 | `pve/destiny/popup_node_info_9s` | 面板 | 400×280 |
| E1节点图 | `pve/destiny/node_icon_e1` | 图标 | 52×52，「命运预言」 |
| E2节点图 | `pve/destiny/node_icon_e2` | 图标 | 52×52，「灵气强化」 |
| E3节点图 | `pve/destiny/node_icon_e3` | 图标 | 52×52，「命运护佑」 |
| E4节点图 | `pve/destiny/node_icon_e4` | 图标 | 52×52，「命运庇护」 |
| E5节点图 | `pve/destiny/node_icon_e5` | 图标 | 52×52，「命运主宰」 |

---

## 13. 通用弹窗（跨系统复用）❌ 全缺

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 通用确认弹窗面板 | `common/popup/panel_confirm_9s` | 面板 | 560×320，九宫格 |
| 「确认」按钮 | `common/popup/btn_confirm_9s` | 按钮 | 200×64 |
| 「取消」按钮 | `common/popup/btn_cancel_9s` | 按钮 | 200×64 |
| 奖励获得弹窗 | `common/popup/panel_reward_9s` | 面板 | 560×480 |
| 奖励图标框（金） | `common/popup/frame_reward_gold` | 边框 | 96×96，金色 |
| 奖励图标框（紫） | `common/popup/frame_reward_epic` | 边框 | 96×96，紫色 |

---

## 14. 职业图标（PVE 专属）❌ 全缺

> 用于角色面板、职业进阶弹窗、觉醒弹窗的职业标识。

| 元素名称 | 资源命名 | 类型 | 尺寸 |
|---------|---------|------|------|
| 职业·冒险者图标 | `pve/class/icon_class_adventurer` | 图标 | 64×64 |
| 职业·狂战士图标 | `pve/class/icon_class_berserker` | 图标 | 64×64 |
| 职业·射手图标 | `pve/class/icon_class_archer` | 图标 | 64×64 |
| 职业·隐匿者图标 | `pve/class/icon_class_rogue` | 图标 | 64×64 |
| 觉醒·狂战士（型态A） | `pve/class/icon_awaken_berserker_a` | 图标 | 64×64 |
| 觉醒·狂战士（型态B） | `pve/class/icon_awaken_berserker_b` | 图标 | 64×64 |
| 觉醒·射手（型态A） | `pve/class/icon_awaken_archer_a` | 图标 | 64×64 |
| 觉醒·射手（型态B） | `pve/class/icon_awaken_archer_b` | 图标 | 64×64 |
| 觉醒·隐匿者（型态A） | `pve/class/icon_awaken_rogue_a` | 图标 | 64×64 |
| 觉醒·隐匿者（型态B） | `pve/class/icon_awaken_rogue_b` | 图标 | 64×64 |
| 职业碎片·冒险者 | `pve/class/icon_fragment_adventurer` | 图标 | 32×32 |
| 职业碎片·狂战士 | `pve/class/icon_fragment_berserker` | 图标 | 32×32 |
| 职业碎片·射手 | `pve/class/icon_fragment_archer` | 图标 | 32×32 |
| 职业碎片·隐匿者 | `pve/class/icon_fragment_rogue` | 图标 | 32×32 |

---

## 15. 遗物与卷轴图标（PVE 专属）❌ 全缺

> 当前系统：RelicSystem（遗物）和 ScrollSystem（卷轴）均已实现，图标全部缺失。

| 元素名称 | 资源命名 | 类型 | 说明 |
|---------|---------|------|------|
| 遗物通用占位图 | `pve/icons/icon_relic_default` | 图标 | 64×64 |
| 遗物·章节1奖励 | `pve/relics/icon_relic_ch1` | 图标 | 64×64 |
| 遗物·章节2奖励 | `pve/relics/icon_relic_ch2` | 图标 | 64×64 |
| 遗物·章节3奖励 | `pve/relics/icon_relic_ch3` | 图标 | 64×64 |
| 遗物·章节4奖励 | `pve/relics/icon_relic_ch4` | 图标 | 64×64 |
| 遗物·章节5奖励 | `pve/relics/icon_relic_ch5` | 图标 | 64×64 |
| 卷轴图标 | `pve/icons/icon_scroll` | 图标 | 48×48 |

---

## 16. 微信小游戏专属 UI

### 16.1 分享与图标（上架必须）

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 分享卡片封面图 | `wx/share_cover` | 图片 | **500×400（5:4）**，核心内容在中间460×360安全区内 | ❌ |
| 分享卡片默认图 | `wx/share_default` | 图片 | 同上，无截图时备用 | ❌ |
| 游戏图标（正方形） | `wx/icon_app_square` | 图标 | 240×240，小程序图标 | ❌ |
| 游戏图标（圆形） | `wx/icon_app_round` | 图标 | 240×240，圆形版 | ❌ |
| 游戏封面（横版） | `wx/cover_landscape` | 图片 | 1280×720，游戏库封面 | ❌ |

### 16.2 审核必须项（⚠️ 不做无法上线）

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 用户隐私协议弹窗面板 | `wx/panel_privacy_9s` | 面板 | 560×560，含可滚动文字区+同意/拒绝按钮，首次启动强制弹出 | ❌ |
| 「同意」按钮 | `wx/btn_privacy_agree_9s` | 按钮 | 220×64，高亮主色 | ❌ |
| 「不同意」按钮 | `wx/btn_privacy_decline_9s` | 按钮 | 220×64，次要色 | ❌ |

### 16.3 运营与体验

| 元素名称 | 资源命名 | 类型 | 说明 | 状态 |
|---------|---------|------|------|------|
| 版本更新提示弹窗 | `wx/panel_update_9s` | 面板 | 480×300，「发现新版本，立即更新」 | ❌ |
| 横屏提示全屏图 | `wx/bg_rotate_hint` | 背景 | 720×1280，「请旋转至竖屏」图示 | ❌ |

---

## 缺失检查结论

### 🔴 P0：严重缺失（阻塞发布）
1. **微信隐私协议弹窗**（`wx/panel_privacy_9s`）——无此弹窗无法通过审核
2. **PVE HUD emoji 替换图标**（12个）——双端渲染风格割裂，真机必现
3. **PVE 全部美术资产**（背景×6、HUD框架×16、地图图集×25+、面板×12、弹窗×16+、图标×30+）
4. **命运树 UI 全套**（背景、节点×5类型、连接线、按钮）
5. **微信分享封面**（直接影响传播，上线必须）
6. **Loading Spinner**（已报告 bug：真机不可见）
7. **遗物/卷轴图标**（RelicSystem 和 ScrollSystem 已实现，图标为空）

### 🟠 P1：高风险缺失（影响体验，应同期制作）
8. **神像/温泉/祭坛确认弹窗**——祭坛为扣血操作，无确认极易误触
9. **职业图标×4 + 觉醒形态图标×6**——角色面板、进阶/觉醒弹窗均需要
10. **成就解锁横幅条**——成就系统已实现但无视觉反馈
11. **Boss 登场过渡 UI**——进 Boss 层无仪式感，重要体验节点
12. **PVE 退出确认弹窗**（含进度保存说明）
13. **死亡弹窗内「看广告复活」按钮**（接入广告前预留布局）

### 🟡 需替换/升级
1. 大厅三个按钮目前互用（`btn_lobby_create/join/match`），PVE 入口需独立美术
2. 大厅背景/棋盘背景已有占位，视觉风格待统一
3. 命运碎片图标（`icons/icon_destiny_shards`）完全缺失，当前仅用 emoji「💎」显示
4. 地图空地格命名从 `tile_floor` 改为 `tile_floor_ch1~ch5`（兼容章节主题色）

### 🟢 已完成
- 大厅·房间·棋盘·结算完整资产（共 70+ 个 sprite）
- 棋盘全格子类型（11 种）
- 玩家棋子（4个玩家 + 3个中立）
- 棋盘按钮（7个）
- 道具/装备/状态图标（25+个）
