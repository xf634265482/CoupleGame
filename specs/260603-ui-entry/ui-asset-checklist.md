# UI 入场资源清单与接入计划

> 功能总览与文档地图见 **[`README.md`](./README.md)**；外出用体验版联测见 **[`mobile-testing.md`](./mobile-testing.md)**。  
> 玩法规则以 **`specs/260529-combat-board-game-rework/design.md`** 为准（2026-06-05：已移除吹牛小游戏，事件格改为 9 种随机事件）。

## 目标

把当前代码绘制的占位 UI，逐步替换为图片资源，优先提升玩家第一眼看到的视觉质量：

1. 大厅 / 房间页面
2. 棋盘主界面
3. 格子、棋子角色、按钮、面板
4. 结算页、弹窗、状态图标

所有资源放到 `assets/resources/art/ui/`（`resources` 包，供代码 `resources.load`）。**不要**再用目录联接复制一份到 `assets/art/ui`，否则会出现 `uuid is already pointing to another asset`。Cocos 打开项目后会自动生成 `.meta`；生成后可在项目根目录执行 `python scripts/sync-ui-asset-uuids.py` 同步 UUID 到 `UiAssets.ts`。

## 目录结构

```text
assets/resources/art/ui/
  common/        通用按钮、弹窗、遮罩、输入框
  backgrounds/   大厅、房间、棋盘、结算背景
  lobby/         大厅页面专用资源
  room/          房间页面专用资源
  board/
    cells/       棋盘格子
    pawns/       棋子/角色头像/角色站姿
    buttons/     棋盘右侧操作按钮
    panels/      棋盘 HUD、消息栏、玩家卡片、状态栏
  settlement/    结算页资源
  icons/         通用图标：金币、钻石、武器、道具、状态
```

> **已移除**：`minigame/` 目录与吹牛小游戏场景（`minigame_bluff`）不再使用。

## 通用规格

- 格式：优先 `png`，透明图必须带 alpha。
- 命名：全小写英文 + 下划线，例如 `btn_board_roll.png`。
- 尺寸：导入原图建议 2x 或 3x，代码中按设计尺寸缩放。
- 九宫格：按钮、面板、弹窗背景建议做可拉伸图，命名后缀 `_9s`。
- 风格建议：轻竞技桌游风，深色底 + 高饱和功能色，格子和按钮要一眼能区分。

## 当前进场概览（2026-06-05）

### 已完成 ✅

| 区域 | 状态 |
|------|------|
| 背景 | 大厅、房间、棋盘主界面 |
| 棋盘格子 | 全套功能格（含事件格×6）、选中框、区域框 |
| 棋盘面板 | 底部 HUD、玩家卡、消息栏、弹窗、Toast、回合状态条 |
| 基础图标 | 金币、钻石、生命 |
| 棋子/头像 | 玩家棋子×4、中立生物×3（房间/棋盘复用棋子图） |
| 棋盘按钮 | 右侧投骰/背包/攻击/地图/说明/结束/快捷消息 |
| 大厅 | Logo、主面板、三个入口按钮、昵称输入框 |

### 待进场 ⬜（按优先级）

| 优先级 | 区域 | 说明 |
|--------|------|------|
| **P0** | 装备/道具图标 | 商店、背包、HUD 仍用文字；最显眼占位 | ✅ 已进场 |
| **P0** | 免疫药水图标 | 金币商店新商品 `IMMUNITY_POTION` | ✅ 已进场 |
| **P1** | 房间专用 UI | 座位卡、房主/AI 标签、开始/邀请/退出按钮 | ✅ 已进场 |
| **P1** | 阶段徽章 | 发育/争夺/决战（回合 1/10/18 展示） |
| **P2** | 状态 debuff/buff 图标 | 感染、天选悬赏、神秘护符 | ✅ 已进场 |
| **P2** | 结算页 | 背景 + 主面板 + 排名标识 |
| **P3** | 事件弹窗装饰 | 可选：9 种事件插图或统一事件框头图 |

### 已废弃 🗑️

- `cell_minigame.png`、吹牛小游戏全套 UI、`bg_minigame_bluff.png`
- 事件转盘（厄运/空投）相关美术

---

## 背景图

| 文件名 | 目录 | 建议尺寸 | 用途 | 状态 |
| --- | --- | --- | --- | --- |
| `bg_lobby.png` | `backgrounds/` | 1334x750，≤350KB | 大厅背景 | ✅ 已压缩 (~272KB) |
| `bg_room.png` | `backgrounds/` | 1334x750，≤350KB | 房间背景 | ✅ 已压缩 (~304KB) |
| `bg_board.png` | `backgrounds/` | 1334x750，≤350KB | 棋盘主界面背景 | ✅ 已压缩 (~316KB) |
| `bg_settlement.png` | `backgrounds/` | 1334x750，≤400KB | 结算页背景 | ✅ 已压缩 (~382KB) |

> 微信真机：`patch-wechatgame-config.js` 会把上述 4 张背景 + BGM 复制到主包 `assets/resources/native/`（压缩后主包仍 < 4MB）。重压缩可执行 `python scripts/compress-ui-large-assets.py`（原图备份为 `*.pngbak`）。

## 大厅页面

目录：`assets/resources/art/ui/lobby/`

| 文件名 | 建议尺寸 | 用途 | 状态 |
| --- | --- | --- | --- |
| `logo_game.png` | 520x180 | 游戏标题 Logo | ✅ 已进场 |
| `panel_lobby_main_9s.png` | 760x420 | 大厅主面板 | ✅ 已进场 |
| `btn_lobby_create_9s.png` | 360x96 | 创建房间 | ✅ 已进场 |
| `btn_lobby_join_9s.png` | 360x96 | 加入房间 | ✅ 已进场 |
| `btn_lobby_match_9s.png` | 360x96 | 在线匹配 | ✅ 已进场 |
| `input_lobby_name_9s.png` | 520x80 | 游戏名输入框 | ✅ 已进场 |

## 房间页面

目录：`assets/resources/art/ui/room/`

代码已用 `bg_room` + 棋子图渲染座位，以下专用资源可提升辨识度：

| 文件名 | 建议尺寸 | 用途 | 状态 |
| --- | --- | --- | --- |
| `panel_room_main_9s.png` | 920x560 | 房间主面板（细边框九宫格+透明内区 v4） | ✅ v4 已进场 |
| `card_room_player_empty.png` | 280x172 | 空座位（灰色铆钉框 + 空位文案） | ✅ v2 已进场 |
| `card_room_player_ready.png` | 280x172 | 已加入玩家（蓝色奇幻框） | ✅ v2 已进场 |
| `tag_room_host.png` | 120x48 | 房主标识（皇冠徽章） | ✅ v2 已进场 |
| ~~`tag_room_bot.png`~~ | ~~120x48~~ | ~~AI 标识~~ | 🗑️ 已移除 |
| `btn_room_start_9s.png` | 320x88 | 开始游戏 | 🗑️ 不用（复用 `lobby/btn_lobby_create_9s`） |
| `btn_room_invite_9s.png` | 320x88 | 邀请好友 | 🗑️ 不用（复用 `lobby/btn_lobby_join_9s`） |
| `btn_room_leave_9s.png` | 260x76 | 退出房间 | 🗑️ 不用（复用 `lobby/btn_lobby_join_9s`） |

## 棋盘格子

目录：`assets/resources/art/ui/board/cells/`

建议单格原图：`96x96`，实际显示约 34-40。开局 **6 个事件格**（原 3 事件 + 3 小游戏合并）。

| 文件名 | 对应类型 | 中文显示 | 状态 |
| --- | --- | --- | --- |
| `cell_normal.png` | `NORMAL` | 普通格 | ✅ 已进场 |
| `cell_gold.png` | `GOLD` | 金币格 | ✅ 已进场 |
| `cell_diamond.png` | `DIAMOND` | 钻石格 | ✅ 已进场 |
| `cell_supply.png` | `SUPPLY` | 补给格 | ✅ 已进场 |
| `cell_waste.png` | `WASTE` | 废格 | ✅ 已进场 |
| `cell_burning.png` | `BURNING` | 燃烧格（废格+补给格） | ✅ 已进场 |
| `cell_event.png` | `EVENT` | 事件格 | ✅ 已进场 |
| `cell_gold_shop.png` | `GOLD_SHOP` | 金币商店 | ✅ 已进场 |
| `cell_legendary_shop.png` | `LEGENDARY_SHOP` | 传说商店 | ✅ 已进场 |
| `cell_final_shop.png` | `FINAL_SHOP` | 决战商店 | ✅ 已进场 |
| `cell_lucky.png` | `LUCKY` | 幸运格 | ✅ 已进场 |
| `cell_selected_frame.png` | 选中描边 | 当前玩家/焦点 | ✅ 已进场 |
| `cell_region_frame_1.png` | 区域 1 | 区域描边 | ✅ 已进场 |
| `cell_region_frame_2.png` | 区域 2 | 区域描边 | ✅ 已进场 |
| `cell_region_frame_3.png` | 区域 3 | 区域描边 | ✅ 已进场 |
| ~~`cell_minigame.png`~~ | ~~`MINIGAME`~~ | ~~小游戏格~~ | 🗑️ 已废弃 |

## 棋子 / 角色

目录：`assets/resources/art/ui/board/pawns/`

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `pawn_player_1.png` | 玩家 1 棋子 / 房间座位 / HUD | ✅ 已进场 |
| `pawn_player_2.png` | 玩家 2 | ✅ 已进场 |
| `pawn_player_3.png` | 玩家 3 | ✅ 已进场 |
| `pawn_player_4.png` | 玩家 4 | ✅ 已进场 |
| `neutral_region_1.png` | 区域 1 中立生物 | ✅ 已进场 |
| `neutral_region_2.png` | 区域 2 中立生物 | ✅ 已进场 |
| `neutral_region_3.png` | 区域 3 中立生物 | ✅ 已进场 |

## 棋盘按钮

目录：`assets/resources/art/ui/board/buttons/`

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `btn_board_roll_9s.png` | 投骰 | ✅ 已进场 |
| `btn_board_bag_9s.png` | 背包 | ✅ 已进场 |
| `btn_board_attack_9s.png` | 攻击 | ✅ 已进场 |
| ~~`btn_board_map_9s.png`~~ | ~~地图~~ | 🗑️ 已移除 |
| `btn_board_help_9s.png` | 说明 | ✅ 已进场 |
| `btn_board_end_9s.png` | 结束 | ✅ 已进场 |
| `btn_board_quick_chat.png` | 快捷消息 | ✅ 已进场 |
| `btn_board_disabled_9s.png` | 禁用态 | ✅ 已进场 |

## 棋盘面板

目录：`assets/resources/art/ui/board/panels/`

| 文件名 | 建议尺寸 | 用途 | 状态 |
| --- | --- | --- | --- |
| `panel_board_hud_9s.png` | 900x170 | 底部玩家信息背景 | ✅ 已进场 |
| `card_board_player_9s.png` | 260x140 | 玩家卡片 | ✅ 已进场 |
| `card_board_player_selected_9s.png` | 260x140 | 当前选中视角玩家卡 | ✅ 已进场 |
| `panel_board_message_9s.png` | 320x90 | 右侧消息栏 | ✅ 已进场 |
| `panel_board_modal_9s.png` | 700x460 | 商店/攻击/背包/**事件弹窗** | ✅ 已进场（事件复用） |
| `panel_board_guide_9s.png` | 600x540 | 格子说明弹窗 | ✅ 已进场 |
| `panel_board_toast_9s.png` | 680x320 | 移动完成/事件提示 | ✅ 已进场 |
| `bar_turn_status_9s.png` | 800x44 | 回合状态条（显示第 N 回合） | ✅ 已进场 |
| `badge_phase_dev.png` | 160x60 | 发育阶段（第 1～9 回合） | ⬜ 待做 |
| `badge_phase_contest.png` | 160x60 | 争夺阶段（第 10～17 回合） | ⬜ 待做 |
| `badge_phase_final.png` | 160x60 | 决战阶段（第 18 回合起） | ⬜ 待做 |

### 事件弹窗（代码已接入，美术可选增强）

当前 `BoardCombatUi.showEventModal()` 复用 `panel_board_modal_9s.png`，展示标题/描述/效果与选项按钮。9 种事件：

| 事件 ID | 展示名 | 交互类型 |
|---------|--------|----------|
| `BOSS_SUPPRESSION` | boss压制 | 全员左/右选择 |
| `CHARITY_MERCHANT` | 慈善商人 | 商店购买 |
| `ABANDONED_CHEST` | 废弃宝箱 | 确认触发 |
| `SANDSTORM` | 沙尘暴 | 确认触发 |
| `LUCKY_GAMBLER` | 幸运赌徒 | 下注金额 |
| `CHOSEN_ONE` | 天选之人 | 确认触发 |
| `INFECTION` | 感染 | 确认触发 |
| `RESOURCE_AUCTION` | 资源拍卖会 | 出价/放弃 |
| `TIME_WARP` | 时空穿梭 | 确认触发 |

可选美术：`panel_event_header.png`（事件弹窗顶栏装饰，非必须）。

## 图标

目录：`assets/resources/art/ui/icons/`

建议尺寸：`64x64` 或 `96x96`。

### 基础资源 ✅

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `icon_gold.png` | 金币 | ✅ 已进场 |
| `icon_diamond.png` | 钻石 | ✅ 已进场 |
| `icon_hp.png` | 生命 | ✅ 已进场 |

### 装备 / 道具 ⬜ P0

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `icon_weapon_sword.png` | 剑 | ✅ 已进场 |
| `icon_weapon_gun.png` | 枪 | ✅ 已进场 |
| `icon_weapon_rocket.png` | 火箭炮 | ✅ 已进场 |
| `icon_armor_helmet.png` | 头盔 | ✅ 已进场 |
| `icon_armor_armor.png` | 铠甲 | ✅ 已进场 |
| `icon_shoes_marching.png` | 行军鞋 | ✅ 已进场 |
| `icon_shoes_rapid.png` | 神速鞋 | ✅ 已进场 |
| `icon_item_dice.png` | 双骰子 | ✅ 已进场 |
| `icon_item_trap.png` | 陷阱 | ✅ 已进场 |
| `icon_item_medkit.png` | 医疗包 | ✅ 已进场 |
| `icon_item_immunity.png` | **免疫药水**（金币商店 400 金） | ✅ 已进场 |
| `icon_item_vampire.png` | 吸血石 | ✅ 已进场 |

### 状态 / 战报 ⬜ P2

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `icon_kill.png` | 击杀数 | ✅ 已进场 |
| `icon_status_infected.png` | 感染 debuff | ✅ 已进场 |
| `icon_status_bounty.png` | 天选之人悬赏 | ✅ 已进场 |
| `icon_status_amulet.png` | 神秘护符（拍卖会获得） | ✅ 已进场 |
| `icon_warning.png` | 通用警告 | ✅ 已进场 |
| `icon_connected.png` | 在线状态 | ✅ 已进场 |

## 结算页

目录：`assets/resources/art/ui/settlement/`

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `panel_settlement_main_9s.png` | 结算主面板 | ✅ 已进场 |
| `rank_1.png` | 第一名标识 | ✅ 已进场 |
| `rank_2.png` | 第二名标识 | ✅ 已进场 |
| `rank_3.png` | 第三名标识 | ✅ 已进场 |
| `tag_winner.png` | 胜利 | ✅ 已进场 |
| `tag_defeated.png` | 淘汰 | ✅ 已进场 |
| `btn_settlement_back_9s.png` | 返回大厅 | ✅ 已进场 |
| `btn_settlement_again_9s.png` | 再来一局 | ✅ 已进场 |

## 接入顺序建议

### 第 1 步：装备/道具/免疫药水图标（P0）

目标文件：

- `assets/scripts/game/board/HudController.ts`
- `assets/scripts/game/board/BoardCombatUi.ts`

替换 HUD 玩家卡、商店列表、背包中的文字占位。

### 第 2 步：房间按钮与座位卡（P1）

目标文件：

- `assets/scripts/lobby/RoomController.ts`

替换右侧按钮 Graphics 占位、座位卡底图。

### 第 3 步：阶段徽章 + 状态图标（P1～P2）

目标文件：

- `assets/scripts/game/board/HudController.ts`

回合条旁展示发育/争夺/决战；玩家卡角标展示感染/悬赏/护符。

### 第 4 步：结算页（P2）

目标文件：

- `assets/scripts/settlement/SettlementController.ts`

### 第 5 步：事件弹窗装饰（P3，可选）

目标文件：

- `assets/scripts/game/board/BoardCombatUi.ts`

## 给美术的最小下一批交付

若只出一批资源，建议：

1. `icon_weapon_sword/gun/rocket.png`
2. `icon_armor_helmet/armor.png`
3. `icon_shoes_marching/rapid.png`
4. `icon_item_dice/trap/medkit/immunity.png`
5. `btn_room_start/invite/leave_9s.png`（房间三按钮）
6. `badge_phase_dev/contest/final.png`
7. `bg_settlement.png` + `panel_settlement_main_9s.png`

## 导入操作

1. 把图片放到对应目录。
2. 打开 Cocos Creator，等待 `.meta` 自动生成。
3. 对需要拉伸的按钮/面板图设置九宫格。
4. 先在场景中手动拖 1-2 张图确认显示正常。
5. 再改代码批量引用。
6. 每完成一类资源，构建微信小游戏并执行：

```bash
node scripts/patch-wechatgame-config.js
```

脚本会把 `assets/resources` **自动挪到** `subpackages/resources/`，写入 `game.json`，并生成微信要求的 `subpackages/resources/game.js`。

### 微信包体（错误码 80051 / 超过 4MB）

- **`assets/resources`** 在 Inspector 中设为 Asset Bundle，**Compression Type = 小游戏分包**（仓库已写入 `assets/resources.meta` 的 `wechatgame: subpackage`）。
- 构建面板勾选 **分离引擎**（`separateEngine`），主包只留脚本与小资源。
- 大图放 `assets/resources/art/ui/` 后可用 `python scripts/resize-ui-resources.py` 压到推荐尺寸（格子 128、背景宽 1280）。
- `patch-wechatgame-config.js` 会**合并** `game.json`，不会删掉 Cocos 生成的 `subpackages`。
- 预览前：Cocos **构建** → `node scripts/patch-wechatgame-config.js` → 微信开发者工具 **清缓存 + 编译**。
- **真机资源加载**见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`。

### 常见报错

| 现象 | 处理 |
|------|------|
| `spine.wasm-*.js` ENOENT | 项目未用 Spine，已在 `settings/v2/packages/engine.json` 关闭；**重新构建** |
| `__plugin__/wx0446ba2621dda60a/2d.js` not defined | 本地预览建议 **取消勾选** 微信引擎插件后重建 |
| `physics-2d-framework.js` ENOENT | 删除 `build/wechatgame` 后全量重建 |
| 微信工具导入路径 | 必须导入 **`build/wechatgame`** |
| 仍超 4MB | resources 分包 + 分离引擎 + 压缩 UI 图 |
| 真机大厅黑底 | 重跑 patch、清缓存；见 `cocos-wechatgame-subpackage.mdc` |
| `[UiAssets] probe FAILED` | 未跑 patch 或主包缺 import；重跑 patch |

## 风险与建议

- 不建议一次性替换所有 UI，容易把功能问题和美术问题混在一起。
- 棋盘格子必须保证颜色/图形差异明显；**事件格**与**幸运格**要易于区分。
- 免疫药水、感染状态是新玩法关键视觉，建议与装备图标同一批交付。
- 微信小游戏包体要控制大小；图片较多时可拆远程资源或压缩纹理。
