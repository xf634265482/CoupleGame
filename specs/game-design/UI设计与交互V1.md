# UI 设计与交互 V1

> 来源：拆分自 `specs/260610-destiny-tree-ui/design.md` + `assets/scripts/pve/views/*` + `assets/scripts/pve/controllers/*`。
> 实现文件：`PveHudView.ts` / `PveCharacterPanel.ts` / `PveToastView.ts` / `FogMapView.ts` / `PveMessageLog.ts` / `DestinyTreeView.ts` / `pveUiKit.ts` / `ExpeditionController.ts` / `DestinyTreeController.ts` / `LobbyController.ts`（大厅顶部货币栏）。
> 状态：M1 已全部落地，纯 Graphics + Label 占位渲染（无美术资源）。
> 关联文档：[命运树设计V1](命运树设计V1.md) / [职业系统V1](职业系统V1.md) / [数值系统V1](数值系统V1.md) / [Boss设计V1](Boss设计V1.md)

## 〇、屏幕方向与设计分辨率（竖屏改造 Phase 1）

- **范围**：命运远征（PVE）、大厅（Lobby）、命运树。Board/Settlement（PVP，入口已隐藏）暂不重构。
- **全局方向**：`config/wechatgame.game.json` 的 `deviceOrientation` 由 `landscape` 改为 `portrait`（微信小游戏方向为全局声明，不支持运行时按场景切换，故采用全局竖屏）。
- **设计分辨率**：`assets/scripts/platform/wechat/ViewAdapt.ts`
  - `DESIGN_W=720, DESIGN_H=1280`，`ResolutionPolicy.FIXED_WIDTH`（宽固定 720，高随设备比例向下扩展）。
  - `applyLandscapeResolution()` 重命名为 `applyPortraitResolution()`。
  - `visibleDesignSize()` 返回 `{ w: 720, h: max(1280, 设备可视高度) }`。
  - `syncCanvasCamera()` 的 `orthoHeight` 由固定 `360` 改为动态 `visibleDesignSize().h / 2`，跟随设备实际高度。
- **方向锁定**：`assets/scripts/platform/wechat/WxLandscape.ts` 新增 `lockPortrait()`；`GameApp.ts`（bootstrap）、`WxCloudInit.ts`、`LobbyController.ts`、`ExpeditionController.ts`、`DestinyTreeController.ts` 的 `lockLandscape()` 均改为 `lockPortrait()`。`lockLandscape()` 函数保留（`BoardController`/`SettlementController` 等隐藏中的 PVP 场景仍调用，作为占位，本轮不改）。
- **已知债务**：
  - Board/Settlement 在新的 720x1280 竖屏画布上会布局错位（其代码假设 1280x720 横屏），因入口隐藏暂不影响，后续若重新开放 PVP 需单独重构。
  - 背景图（`bg_lobby`/`bg_room`/`bg_board`/`bg_settlement`）目前是横版构图，`applyScreenBackground` 走 cover 裁切适配竖屏容器会被严重放大裁切，需要后续替换为竖版美术资源。
  - PVE 远征、命运树均已完成竖屏布局重排（Phase 2 见第九节，Phase 3 见第三、五、八节）。

## 一、设计原则

- **M1 无美术资源**：所有 UI 元素均由 `pveUiKit.ts` 提供的两个基础构件拼装——`makeFlatButton`（纯色矩形按钮 + 居中文字）、`makeLabel`（纯文字标签，初始为空字符串以避免 Cocos 默认 "label" 占位文字闪现）。后续替换美术资源时，理论上只需替换这两个构件的内部实现。
- **节点池化 + diff 刷新**：`FogMapView`、`PveMessageLog` 均预建固定数量的节点常驻复用，仅在内容变化时重绘/更新文本，不在每次 `refresh` 时销毁重建（参考 `BoardView` 的既有模式）。
- **阻塞式选择走 Promise 弹窗**：所有"三选一/确认"类交互（强化、命运树三选一、职业进阶、营地、铁匠铺）统一通过 `PveToastView` 的 `show*` 方法返回 `Promise`，Controller 用 `await` 串联流程，期间 `_busy` 标志阻止重复输入。

## 二、整体场景流程

```
大厅 (lobby.scene)
  ├─ 「命运远征」按钮 → SceneLoader.loadPveExpedition() → 远征场景
  │     （ExpeditionController：地图 + HUD + 战报 + 弹窗，进入即 bootstrap 续档/开新局）
  └─ 「命运树」按钮 → SceneLoader.loadDestinyTree() → 命运树场景
        （DestinyTreeController + DestinyTreeView：5x3 节点网格，独立于远征流程）
```

两个 PVE 入口在大厅菜单中相邻（`LobbyController.ts`），「命运远征」为主入口（紫色按钮），「命运树」为局外成长入口（金色按钮），两者数据通过账户级 `PveMeta`（`destinyShards` / `unlockedTreeNodes`）关联，但场景相互独立、互不嵌套。

## 三、远征场景布局（ExpeditionController._buildUi）

竖屏布局（720×1280 画布，`lockPortrait()`，Phase 3），按 z 序自上而下：

| 层级 | 组件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `FogMapView`（地图） | 占据屏幕上半部分，`mapRoot` 位置 `(0, 293)` | 位于屏幕顶部与下方状态网格之间 |
| 2 | `PveHudView`（HUD） | 覆盖全屏 | 状态网格（地图下方、战报栏上方，2 行 x 4 列含 HP/AP）+ D-pad + 动作按钮 + 「返回」「角色」按钮 |
| 3 | `PveMessageLog`（战报栏） | 状态网格下方横条，`(0, -screenH/2+390)`，640×180px，水平居中 | 不遮挡地图，文字不溢出面板 |
| 4 | `PveToastView`（toast + 弹窗） | 覆盖全屏 | 默认隐藏，事件触发时显示 |
| 5 | `PveCharacterPanel`（角色面板） | 覆盖全屏，居中 580×700px | 默认隐藏，点击 HUD「角色」按钮唤起 |

地图格子尺寸按楼层尺寸动态计算：`cellSize = max(28, floor(min(screenW-16, screenH-610) / floor.size))`（`floor.size` 为当前楼层的 8/9/10），尽量填满可用宽度（左右各留 8px），同时不超过可用高度（保证 10×10 Boss 层不溢出）。基准下 8×8 普通层 cellSize≈83px、9×9≈74px、10×10≈67px，相比此前固定按 10×10 计算 cellSize（普通层左右各留约 90px 黑边），普通层左右黑边收窄至约 28px。`mapRoot.y=293`、可用高度 `screenH-610`、`PveHudView` 状态网格 `ROW1_Y=-screenH/2+571` 等三组常量联动推导，使「地图 → 状态网格 → 战报栏」自上而下贴合排布，互不遮挡。

## 四、迷雾地图视图（FogMapView）

- 网格为 8×8（普通层）/ 9×9 / 10×10（Boss 层），原点居中，`(x-half)*cellSize` 计算每格局部坐标。
- 节点池化：`_rebuild(size)` 在尺寸变化（楼层切换）时整体重建一次；同尺寸内的刷新仅 diff `revealed` 状态与格上内容（`cellContentKey`）。
- 战争迷雾：未揭示格用 `FOG_COLOR`（深灰）覆盖，已揭示格用 `FLOOR_COLOR`，网格线 `GRID_LINE`。
- 内容图标（Graphics 色块 + 单字 Label 占位）：

  | 内容 | 图标字 | 颜色基调 |
  |------|--------|----------|
  | 玩家 | 人 | 浅蓝 |
  | 普通怪 / 灵气怪 / 精英怪 / Boss | 怪 / 灵 / 精 / 王 | 红 / 紫 / 橙 / 深红 |
  | 宝箱 / 钥匙 / 出口 / 传送门 | 箱 / 钥 / 门 / 门 | 黄系 / 绿 / 青 |
  | 铁匠铺 / 神像 / 温泉 / 祭坛 / 职业碎片 | 锻 / 像 / 泉 / 坛 / 碎 | 灰 / 紫 / 青 / 红 / 绿 |

- 交互：点击格子 → `onCellTap(coord)` 回调，由 Controller 决定是移动寻路、攻击目标还是拾取交互（具体规则属于 design 主文档范畴，本文仅描述 UI 层）。

## 五、HUD（PveHudView）

竖屏布局（最新）：原顶部状态条整体下移至「地图下方、战报栏上方」，与地图、战报栏三者贴合排布，避免遮挡屏幕顶部、也避免和「返回/角色」按钮重叠。状态条改为 2 行 x 4 列网格，4 列中心 X 坐标 `[-270, -90, 90, 270]`（列宽 170），行 Y 坐标 `ROW1_Y=-screenH/2+571`、`ROW2_Y=ROW1_Y-38`，状态效果行 `STATUS_Y=ROW2_Y-36`；字体 20（行高 34）。该常量与 `ExpeditionController._buildUi` 中 `mapRoot.y=293`、`FogMapView` 动态 `cellSize`（见第三节）、`PveMessageLog` 顶边（`-screenH/2+480`）联动推导，三者上下贴合、各留 ~3-10px 间距。

HP / AP 已回到顶部网格第一行（与楼层/攻击力同行），玩家视线只需在"地图正下方"一个区域内。

| 区域 | 内容 | 说明 |
|------|------|------|
| 状态网格（第一行，地图下方） | 楼层/回合、AP+骰子、HP、攻击力 | `refresh(state)` 更新战斗数值 |
| 状态网格（第二行） | 金币、灵气+进度、钥匙数、命运碎片(`_shardsLabel`) | `refreshMeta(destinyShards)` 单独更新命运碎片（来自 `PveMeta`，与战斗状态无关） |
| 状态效果行 | 状态效果（冻结❄ / 灼烧🔥等） | 仅在玩家带状态效果时显示 |
| 右侧 D-pad（贴近动作区） | 键盘方向键布局：「上」在上方居中，「左/下/右」一排在下方，各 84px | `makeFlatButton` 占位，触发 `onMove(dir)`；中心 `cx=screenW/2-305, cy=-screenH/2+105`（移到屏幕右侧、贴近攻击/交互/结束回合按钮簇，与动作按钮间距约 35px，便于单手操作），按钮间距 94px |
| 右下动作区 | 攻击 / 交互 / 结束回合（110×60px） | 分别触发 `onAttack` / `onInteract` / `onEndTurn`，`cy=-screenH/2+105`，与 D-pad 中心对齐 |

`ExpeditionController` 监听键盘供**电脑端玩家**操作：方向键/WASD → `onMove`，空格/J → `onAttack`，E/K → `onInteract`，回车 → `onEndTurn`。两条互补路径覆盖不同 PC 客户端：

- **cc.input `KEY_DOWN`（`_onKeyDown`，按 `KeyCode` 派发）**：引擎仅在 `sys.Feature.EVENT_KEYBOARD===true`（实测为 `os===WINDOWS && !isDevTool`）时才注册底层 `wx.onKeyDown`，故只在 **Windows 微信客户端** 生效。
- **`wx.onKeyDown` 兜底（`_onWxKeyDown` → `_handleKeyByCode`，按 `KeyboardEvent.code` 派发）**：当 `EVENT_KEYBOARD===false`（如 **Mac 微信客户端**，`os!==WINDOWS`）时引擎不接管，但 `wx.onKeyDown` 在 Mac 客户端仍受支持，故手动绑定补齐。`onLoad` 中 gated on `!EVENT_KEYBOARD`，与 cc.input 路径互斥、不会重复触发；`onDestroy` 对称 `wx.offKeyDown`。

> **平台限制（已实测）**：**微信开发者工具模拟器**里 `EVENT_KEYBOARD===false`，且既不转发 cc.input KEY_DOWN，也不触发 `wx.onKeyDown` / `document.keydown`（三者皆静默）——即**模拟器无法测试键盘**。需用 **PC 微信客户端**（上传版本后在 Windows/Mac 微信打开）或 **浏览器预览**（cc.input 在 web 平台原生支持键盘）验证。手机真机无物理键盘，不影响触屏操作。
| 地图与战报栏之间 | 「返回」「角色」按钮，`SUB_BTN_Y=-screenH/2+274`，各 120×44px，分别位于 x=-150 / x=150 | 「返回」触发 `onQuit` → `SceneLoader.loadLobby()`；「角色」触发 `onShowCharacter()` → 弹出 `PveCharacterPanel` |

`setVisible(visible)` 用于战斗结束/弹窗期间隐藏整个 HUD（避免弹窗下误触）。

## 六、角色信息面板（PveCharacterPanel）

- 触发：HUD「角色」按钮 → `show(state, meta)`。
- 布局：全屏半透明遮罩（点击遮罩关闭，点击面板本体阻止事件冒泡）+ 居中 580×700px 面板。
- 内容分区（自上而下）：

  1. **基础属性**：职业（`classId`）、HP/maxHp、攻击力+攻击范围、金币&灵气、AP+骰子、钥匙数。
  2. **装备**：5 槽位（武器/头盔/护甲/鞋子/饰品），每行可**点击**展开详情浮层（`EquipDetailPopup`，440×210px，动态品质边框色，显示：装备名（品质色）/ 槽位·品质 / 主属性效果 / 词条）。空槽点击无反应，有装备的槽位标注 `★`（有词条）与 `▸`（可点）提示。品质颜色：普通=灰、精良=绿、稀有=蓝、史诗=紫、传奇=橙金。
  3. **词条**：`classTraits` 列表（职业进阶词条 + 灵气强化获得的通用词条）。
  4. **职业碎片**：按职业分类显示当前碎片数 / 进阶阈值。
     > **待更新**：当前面板硬编码显示 `/3`，但 [职业系统V1 §二](职业系统V1.md#二碎片与进阶流程v2节奏调整) 的 V2 节奏调整已将 `CLASS_FRAGMENTS_TO_ADVANCE` 改为 **5**，该面板的阈值显示需同步改为 `/5`（已知缺口，待后续任务修复）。
  5. **成就**：进度展示（共 8 项，design §8 AC-20）。
  6. **图鉴**：怪物图鉴 / 装备图鉴计数 + 命运碎片数量。

- `update(state, meta?)`：仅刷新数据，不改变可见性；`hide()` 收起面板。

## 七、Toast 与弹窗（PveToastView）

### 7.1 Toast（非阻塞通知）

`toast(message, durationMs=1600)`：屏幕顶部居中、520×64px，自动淡出，用于拾取/状态变化等轻量提示。

### 7.2 阻塞式选择弹窗（均返回 Promise，Controller `await` 串联）

| 方法 | 用途 | 触发时机 | 选项数 |
|------|------|----------|--------|
| `showStrengthenChoice(choices)` | 灵气强化三选一 | 灵气累计达阈值（[数值系统V1](数值系统V1.md) §灵气强化） | 3（从 `STRENGTHEN_LABEL` 池中抽取，ADVENTURER 通用4个 + 当前职业专属5个） |
| `showTreeChoice(title, options)` | 命运树 E2/E3 三选一 | 远征开局 `pendingTreeChoices` 队列（[命运树设计V1 §四](命运树设计V1.md#四e2e3三选一机制)） | 3 |
| `showClassAdvanceChoice(available)` | 职业进阶选择 | 职业碎片达阈值（[职业系统V1 §二](职业系统V1.md#二碎片与进阶流程v2节奏调整)），含「稍后决定」选项 | 1~3 + 稍后决定 |
| `showConfirm(title, options)` | 通用 2+ 选项确认 | 各类确认场景 | ≥2 |
| `showCamp(chapter, player, shopItems, onBuy, onSellEquip)` | 通关后营地 | 每章 Boss 击败后 | 商店购买 / 装备整理（出售）/ 继续远征 / 返回大厅 |
| `showBlacksmith(player, onUpgrade, onReroll)` | 铁匠铺 | 地图上「锻」格交互 | 每个已装备槽位：强化(20💰) / 洗炼(30💰，仅 EPIC/LEGENDARY) |

营地与铁匠铺弹窗内含子流程（如「装备整理」子面板），均在同一 Promise 内通过内部状态切换处理，最终 resolve 后返回 Controller 主流程。

### 7.3 事件回放节奏（手感调优）

`_playEvents` 中每个有文案的事件会先 `toast` 再 `await delay(...)`，串行播放期间 `_busy=true`，玩家此时的方向键/操作输入会被直接丢弃且无反馈。为避免"按键无反应、过一会儿画面才连续变化"的迟钝感，相关延迟已调小：

- 事件 toast 间隔：`delay(120)`（原 250ms）。
- 自动结束回合提示后的过渡：`delay(80)`（原 150ms）。
- 灵气强化生效、楼层通关/Boss 战等强反馈节点的较长延迟（420ms/600ms~2000ms）维持不变，保留戏剧停顿。

## 八、战报栏（PveMessageLog）

- 竖屏布局（Phase 3）：横向宽条面板 640×180px，置于地图下方 `(0, -screenH/2+390)`，水平居中半透明背景 + 边框，标题"📜 战报"。
- 预建 6 条 Label（`MAX_ENTRIES`），`push(turn, kind, text)` 追加新条目，超出后滚出最旧（FIFO）。
- 按事件类型上色（`LogKind`）：

  | 类型 | 颜色基调 | 含义 |
  |------|----------|------|
  | `PLAYER_ACT` | 绿 | 玩家行动（移动/攻击/击杀） |
  | `PLAYER_HURT` | 红 | 玩家受击 |
  | `ENEMY_ACT` | 橙黄 | 怪物行动（移动/攻击/警觉） |
  | `LOOT` | 黄 | 掉落/拾取/开箱 |
  | `AP` | 蓝 | AP 掷骰 |
  | `SYSTEM` | 灰 | 回合分隔/通关/系统提示 |

- 同一回合内仅首行显示"回合N"前缀，其余条目空格缩进对齐，形成视觉分组。
- 设计动机：解决"结束回合后世界悄悄变化、玩家不知道发生了什么"的信息真空问题。
- `clear()`：楼层切换/死亡/重开远征时清空。

### 8.1 怪物发现 / 击杀文案（无进场UI的补偿方案）

M1 无怪物进场动画/弹窗，玩家此前无法得知"出现了什么怪物""击杀了什么怪物"。现通过战报文案补充信息（`ExpeditionController.ts` 的 `MONSTER_VARIANT_CN`/`monsterName`）：

- **发现怪物**：`REVEAL` 事件揭示的格子中若含存活怪物，追加 `ENEMY_ACT` 条目「👀 发现 哥布林弓箭手！」（多个怪物用顿号分隔）。
- **击杀怪物**：`KILL` 事件的 `PLAYER_ACT` 条目从「击杀了一个敌人」改为「💀 击杀了 冰霜哥布林」；对应 toast 同步改为「击败了 冰霜哥布林！」。
- 怪物中文名映射覆盖第一章全部变体（哥布林战士/哥布林弓箭手/冰霜哥布林/赤炎哥布林/灵鼠）与各章 Boss（哥布林酋长/流沙巨蝎/冰霜巨人/熔岩领主/命运守卫）；未命中映射时按 `MonsterType` 兜底显示"普通怪/灵气怪/精英怪/Boss"。

## 九、命运树场景（DestinyTreeView + DestinyTreeController）

- 独立场景，与远征场景完全分离，配色风格与 `PveCharacterPanel` 一致。
- **竖屏布局（Phase 2，720x1280 画布）**：原 5 列(A-E)x3 行(order 1-3) 网格总宽 ~1100px 超出 720 宽画布，已**转置为 5 行 x 3 列**——每个分支（A生存/B战斗/C财富/D强化/E天命）占一整行，行内横向排列该分支 order 1→2→3 三个节点（自左向右天然对应解锁顺序），5 行自上而下纵向堆叠：
  - 标题"命运之树"（居中顶部，`y = screenH/2 - 50`）+ 命运碎片余额（右上角 `_shardsLabel`，同一行）。
  - 节点尺寸 `NODE_W=180, NODE_H=130`；同一行内 3 个节点 `x = (order-2) * NODE_X_SPACING`（`NODE_X_SPACING=210`，即 -210/0/210）。
  - 第 i 个分支（i=0..4，对应 A-E）节点中心 `y = screenH/2 - ROW0_TOP_OFFSET - i * ROW_SPACING`（`ROW0_TOP_OFFSET=195, ROW_SPACING=200`）。
  - 行标签（如"A · 生存"）位于该行节点正上方：`y = 该行节点中心y + ROW_LABEL_OFFSET`（`ROW_LABEL_OFFSET=95`），居中对齐。
  - 「返回大厅」按钮（底部居中，`y = -screenH/2 + 50`，不变）。
- 节点三态着色：
  - **已解锁**（`UNLOCKED_COLOR`，暗金）：已在 `unlockedTreeNodes` 中。
  - **可解锁**（`UNLOCKABLE_COLOR`，蓝）：`canUnlockNode` 返回真（同列前置已解锁 + 碎片足够）。
  - **锁定**（`LOCKED_COLOR`，深灰）：其余情况。
- 节点仅显示名称与解锁所需碎片数，**不展示效果文案**（效果详情见 [命运树设计V1 §三](命运树设计V1.md#三节点一览)）。
- 点击可解锁节点 → `onUnlock(nodeId)` → 云函数 `unlockTreeNode` → 成功后 `render(meta)` 重建网格（`_gridRoot.removeAllChildren()` 后按最新 `PveMeta` 重绘）。
- E2/E3 的"三选一"装备/词条选择**不在本场景展示**，仅在远征开局通过 `PendingTreeChoice` 弹窗（`showTreeChoice`）呈现（见 [命运树设计V1 §六](命运树设计V1.md#六已知范围限制--待规划)）。

## 十、共享 UI 构件（pveUiKit.ts）

| 函数 | 用途 | 关键实现细节 |
|------|------|--------------|
| `makeFlatButton(parent, text, x, y, w, h, onClick, color?)` | 纯色矩形按钮 | Graphics 矩形填充 + 居中 Label（`fontSize` 按高度自适应，`Overflow.SHRINK`）+ `Button.Transition.SCALE`（`zoomScale=0.94`）点击反馈 |
| `makeLabel(parent, x, y, w, h, fontSize, color, align?)` | 纯文字标签 | 初始 `string=''`，避免 Cocos 默认 "label" 占位文字在异步 bootstrap 期间短暂闪现（首屏穿帮） |

所有 PVE 视图（HUD/Toast/角色面板/命运树/战报）均基于这两个构件拼装，未来替换美术资源时可作为统一改造入口。

## 十一、大厅顶部货币栏（LobbyController）

- 大厅菜单页（`_mode === 'menu'`）右上角新增 `CurrencyBar` 节点（`_infoRoot` 的子节点），纵向排列两个 Label：
  - `💎{destinyShards}`（命运碎片，浅蓝色）
  - `💰{diamond}`（钻石，金色）
- 数据来源：`loadPveMeta()`（云函数 `pve.loadMeta`，返回 `PveMeta`，新增 `diamond` 字段，与 `destinyShards` 同样存储于 `users` 集合）。
- 刷新时机：`_showMenu()` 中调用 `_refreshCurrency()`（与 `_refreshUserBanner()` 并列），即每次回到大厅菜单都会重新拉取最新余额。
- 仅在菜单模式显示：`_applyMenuLayout()` 中定位到屏幕右上角并 `active=true`；`_applyRoomLayout()` 中 `active=false`（房间内不展示）。
- 竖屏改造后位置：`(screenW/2 - 130, infoTopY)`，`screenW=720`，`infoTopY = DESIGN_H/2 - 60 = 580`，与 `_statusLabel` 同一行。
- 远征结算（`ExpeditionController._settle`）后会同步更新 `_meta.destinyShards`/`_meta.diamond` 本地快照，下次返回大厅刷新即可拿到最新值。

## 十二、大厅菜单（竖屏布局 + PVP 暂时关闭）

- 当前阶段以 PVE 为主，大厅菜单（`LobbyController._buildUi`）暂时隐藏 PVP 相关入口：
  - 不再创建「创建房间」按钮、房间名输入框（`_gameNameInput`）、「房间列表」标题及房间行/分页按钮（`_listRoot` 及其子节点）。
  - `_showMenu()` 中不再调用 `_gameNameInput?.show()` 与 `_startListPoll()`，避免房间列表轮询。
  - 菜单仅保留「命运远征」「命运树」两个按钮。
- **PVP 可逆性**：相关 PVP 逻辑代码（`_onCreate`/`_onTryStart`/`_refreshRoomList`/`_setListPage`/`WxGameNameInput` 等）均保留不变，仅是对应 UI 节点不再被创建/调用；后续若需恢复，把 `_buildUi` 中对应节点构造与 `_showMenu` 中的 `show()`/`_startListPoll()` 调用加回即可。
- 整体场景流程图（第二节）暂以「命运远征」「命运树」为大厅唯一入口，房间相关流程（创建/加入房间 → `room.scene`）暂不可达，但代码路径仍保留。
- **竖屏布局**（720x1280 画布，`lobbyScale()` 恒定返回 1，原"横屏画布在竖屏设备上放大"的补偿逻辑已移除）：
  - `LobbyLogo`：520x180，居中，Y=360。
  - `LobbyMainPanel`：640x460，居中，Y=-120（`LOBBY_PANEL_Y`）。
  - 「命运远征」「命运树」按钮：480x110，垂直排列于 `MenuBlock`（位置同 `LOBBY_PANEL_Y`），相对 Y 分别为 `+LOBBY_MENU_STEP/2`、`-LOBBY_MENU_STEP/2`（`LOBBY_MENU_STEP = 110 + 36 = 146`），即更大的触控区域，便于单手操作。
  - `_statusLabel`：Y=`infoTopY`（580），居中，宽度沿用 400。

## 十三、已知范围限制 / 待规划

- ~~**竖屏改造 Phase 2（命运树）**：`DestinyTreeView` 的 5x3 节点网格超出 720 宽画布~~ —— 已完成，转置为 5 行(A-E)x3 列(order 1-3) 布局（详见第九节）。
- ~~**竖屏改造 Phase 3（PVE 远征）**：`FogMapView` 地图 cellSize 公式、`PveHudView` 顶部状态条/D-pad/动作按钮、`PveMessageLog` 右上角固定位置均基于 1280x720 横屏假设~~ —— 已完成，顶部状态条改为 2 行x4 列网格、地图居中放大、战报栏移至地图下方横条、「返回」「角色」按钮下移（详见第三、五、八节）。
- **角色面板职业碎片阈值显示**：`PveCharacterPanel` 硬编码 `/3`，需同步 [职业系统V1](职业系统V1.md) V2 调整后的 `/5`。
- **命运树场景节点效果文案**：当前不展示具体数值效果，纯靠节点名称 + 所需碎片数，玩家需查阅外部文档了解效果（已知设计取舍，非缺陷）。
- **美术资源替换**：M1 全部为 Graphics 色块 + Label 占位，正式美术介入时需评估是否保留 `pveUiKit.ts` 的构件接口或整体替换为 Prefab 方案。
- **Boss 第一阶段 `fateGuardianEvade` UI 反馈**：第5章 Boss 闪避判定尚未接入 `CombatSystem`，UI 层暂无对应的"Boss闪避"提示（见 [Boss设计V1 §六](Boss设计V1.md#六第-5-章-boss命运守卫fateguardiantsts第-25-层)）。
