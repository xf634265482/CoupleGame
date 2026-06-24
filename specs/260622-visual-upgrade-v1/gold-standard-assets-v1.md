# Gold Standard Assets V1

## Production Rule

- 每批最多四个候选。
- 候选只进入 `art_pipeline/generated/` 或独立候选目录。
- 不直接写入 `assets/resources/art/**`。
- 核心资产必须 ≥ 85 分。
- 必须保存 64/96/128 px 或 32/48 px 对照。
- 必须经用户选择后才能进入 selected。

## GS-01 · 第一章战场骨架

| ID | 资产 | 类型 | 目标 |
|----|------|------|------|
| GS-BG-CH1 | 云暮哥布林前哨庭背景 | Background | 天空塔庭被哥布林临时占领；外缘有木栅栏、破旗、号角架、补给与瞭望痕迹；中部低细节可行走平台 |
| GS-FIELD-CH1 | 连续战场平面纹理 | Panel/Texture | 半透明暖砂岩与柔和草绿，禁止逐格纹理 |
| GS-FOG-CH1 | 高遮蔽星雾 | Overlay | 90%~100% 遮蔽、柔边、低饱和 |
| GS-RANGE-SET | 状态覆盖规范 | Code + optional texture | 选中/移动/攻击/危险四级 |

当前代码集成状态：

- 移动范围：低强度青色半透明圆角框，仅显示真正可执行的移动落点。
- 当前攻击目标：珊瑚危险色填充 + 柔金内框，视觉权重高于普通移动范围。
- 危险预警：沿用高权重红色覆盖；玩家位于危险格时，青色命运环自动降亮。
- 玩家焦点：脚下低强度青色椭圆命运环，位于单位下方，不遮挡角色。
- 状态：`integrated-pending-device`，等待真机确认透明度与层级。

第一批建议只制作 GS-BG-CH1 的 3 个方向候选，加 1 张战场平面材质板；确认背景构图后再制作迷雾。

当前进度：

- `GS-BG-CH1` 已选择 A：“云暮哥布林前哨庭·边境防御前哨”。
- 参考：`references/gs-bg-ch1-goblin-outpost-selected-a.png`。
- 状态：`integrated-pending-device`。
- 运行资源：`assets/resources/art/ui/pve/backgrounds/bg_pve_ch1.png`。
- Revision 1 已完成：旗帜改为抽象折线阵营符号；中央平台高光已降低并均匀化；已输出 720×1280。
- 下一步：完成代码格线、迷雾、单位组合后的真机合成验证。
- C 方向保留为 Boss 层构图参考，不作为普通楼层背景。

章节背景验收必须回答：

- 哪些元素证明它属于统一天空塔庭世界？
- 哪些元素证明它属于当前章节？
- 哪些环境痕迹关联本章敌人、Boss 或玩法机制？
- 中央棋盘是否仍然安静可读？

## GS-02 · 玩家

| ID | 资产 | 规格 |
|----|------|------|
| GS-PLAYER-BASE | 棕发蓝金冒险者 | 1024 源图，约 1.9 头身，手持短剑，10% 透明边 |
| GS-PLAYER-RING | 青色命运环 | 基础、增强两个状态 |
| GS-PLAYER-SCALE | 缩放对照 | 64/96/128 px |

当前选择：

- 用户选择候选 H。
- 正式精修：`selected/gs-player-h-final-1024.png`。
- 运行资源：`assets/resources/art/ui/pve/map/icon_player.png`，保留原 UUID。
- 64/96/128 对照：`selected/gs-player-h-final-scale.png`。

## GS-03 · 交互物

| ID | 资产 | 识别规则 |
|----|------|----------|
| GS-CHEST | 宝箱 | 暖金奖励感，低于玩家权重 |
| GS-KEY | 钥匙 | 柔金主体 + 青色晶体 |
| GS-EXIT | 普通出口 | 复用当前青色石拱门，以较小尺寸显示 |
| GS-BOSS-PORTAL | Boss 传送门 | 复用当前青色石拱门，以较大尺寸和流程状态区分 |

## GS-04 · 怪物与 Boss

| ID | 资产 | 规格 |
|----|------|------|
| GS-CH1-COMMON | 第一章普通怪 | 占格 62%~72%，卡通威胁 |
| GS-CH1-ELITE | 第一章 Elite | 占格 82%~92%，轮廓 +10% |
| GS-CH1-BOSS | 哥布林酋长 | 105%~125%，至少两个剪影记忆点 |

## GS-05 · UI Kit

| ID | 资产 |
|----|------|
| GS-UI-HUD | HUD 基础面板 |
| GS-UI-MONSTER-CARD | 怪物信息卡 |
| GS-UI-PLAYER-CARD | 玩家状态卡 |
| GS-UI-LOG | 战报面板 |
| GS-UI-BUTTONS | 攻击/互动/结束回合 |
| GS-UI-DPAD | 四方向键 |
| GS-UI-POPUP | 通用弹窗 |
| GS-UI-ICON-FRAME | 道具/技能承载框 |
| GS-UI-TYPE | 字体与字号样张 |

## New Anchor Composition

最终组合锚图必须同时展示：

- 第一章战场。
- 棕发蓝金玩家。
- 普通怪、Elite、Boss。
- 宝箱、钥匙、出口。
- 迷雾和四种范围状态。
- HUD、按钮、弹窗。
- 缩放对照。
