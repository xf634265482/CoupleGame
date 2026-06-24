# Asset Task Board V1

## Status

| 状态 | 含义 |
|------|------|
| READY | 可领取 |
| BRIEF | 正在编写 Brief |
| GENERATING | 正在生成候选 |
| REVIEW | 等待用户选择或评审 |
| SELECTED | 用户已选择 |
| PROCESSED | 技术处理完成 |
| INTEGRATED | 已接入并回归 |
| BLOCKED | 存在冲突或缺少输入 |

## ⚠️ 集成顺序规则

**背景（GS-BG-CH1）必须先于或同步于地面纹理（GS-FIELD-CH1）完成集成。**
在 GS-BG-CH1 集成前，地面纹理由代码暗基底（`Color(15,10,5,70)`）托底，为过渡状态。
集成后需将 `_boardOverlay` 暗基底 α 调低至 30~40，让背景色温透出并与地面纹理自然融合。

## Phase 1 · 战场骨架

| 顺序 | ID | 任务 | 当前状态 | 建议负责 |
|------|----|------|----------|----------|
| 1 | GS-BG-CH1 | 第一章普通楼层背景 | INTEGRATED-PENDING-DEVICE | 图像模型 + Codex 校正 |
| 2 | GS-FIELD-CH1 | 连续战场平面纹理 | INTEGRATED | ChatGPT Brief + 图像模型 |
| 3 | GS-FOG-CH1 | 高遮蔽星雾 | INTEGRATED-PENDING-DEVICE | Codex / 代码与现有纹理合成 |
| 4 | GS-RANGE-SET | 选中/移动/攻击/危险范围 | INTEGRATED-PENDING-DEVICE | Codex / 代码绘制 |
| 5 | GS-BG-CH1-BOSS | 第一章 Boss 层背景 | READY | 参考旧 C 方向重做 |

### GS-BG-CH1 Current Selection

- 方向：A，边境防御前哨。
- 文件：`references/gs-bg-ch1-goblin-outpost-selected-a.png`
- 修订候选：`references/gs-bg-ch1-goblin-outpost-a-revision-1.png`
- 运行资源：`assets/resources/art/ui/pve/backgrounds/bg_pve_ch1.png`（720×1280，保留原 UUID）
- 优点：哥布林占领感直接；木栅栏、旗帜、号角和瞭望结构清楚。
- 待处理：
  - Revision 1 已将旗帜骷髅替换为抽象折线阵营符号。
  - Revision 1 已降低并均匀化中央平台高光。
  - 已校正为真实 720×1280 运行资源。
  - 中央 55% 已保留为连续暖砂岩棋盘承载区。
  - 检查外缘装饰在长屏/窄屏裁切后仍成立。
  - 与玩家、迷雾和代码格线合成。
  - 完成 ≥85 分评审。

## Phase 2 · 玩家

| 顺序 | ID | 任务 | 状态 |
|------|----|------|------|
| 6 | GS-PLAYER-BASE | 棕发蓝金冒险者 | INTEGRATED-PENDING-DEVICE |
| 7 | GS-PLAYER-RING | 青色命运环 | CODE-INTEGRATED-PENDING-DEVICE |
| 8 | GS-PLAYER-SCALE | 64/96/128 对照 | COMPLETED |

## Phase 3 · 交互物

| 顺序 | ID | 任务 | 状态 |
|------|----|------|------|
| 9 | GS-CHEST | 宝箱 | INTEGRATED-PENDING-DEVICE |
| 10 | GS-KEY | 钥匙 | INTEGRATED-PENDING-DEVICE |
| 11 | GS-EXIT | 普通出口 | INTEGRATED-SHARED-PORTAL |
| 12 | GS-BOSS-PORTAL | Boss 传送门 | KEEP-INTEGRATED |
| 12b | GS-HOT-SPRING | 恢复温泉设施样板 | INTEGRATED-PENDING-DEVICE |

### GS-CHEST + GS-KEY Current Selection

- 用户选择：C「塔庭拱形型」，并批准 Revision 1。
- 选中源：`art_pipeline/selected/fate-v2-gs-chest-key-c-rev1/`。
- 运行资源：`assets/resources/art/ui/pve/map/icon_chest.png`、`icon_key.png`，原 UUID 保留。
- 评审：`art-review-gs-chest-key-c-rev1.md`，95/100。
- 已通过 32/48/64 px 与第一章真实比例合成；等待微信真机截图。
- 已应用标准 B 描边：84 px 运行图外扩 2 px `#17243A`。

### GS-EXIT + GS-BOSS-PORTAL Final Decision

- 用户最终裁决：普通出口和 Boss 传送门均使用当前工程的青色石拱门。
- Boss 源图：`assets/resources/art/ui/pve/map/icon_portal.png`（128×128）。
- 普通出口：同款 84×84 运行版，保留 `icon_exit.png` 原 UUID。
- 区分方式：地图生成时机、玩法流程和格内显示尺寸。
- 此裁决覆盖已批准但已回退的阶梯候选 A Revision 1。

### GS-HOT-SPRING Current Selection

- 用户批准：圆形青水泉池、柔金恢复十字、两缕暖白蒸汽。
- 选中源：`art_pipeline/selected/fate-v2-gs-hot-spring-a-rev1/`。
- 运行资源：`assets/resources/art/ui/pve/map/icon_hot_spring.png`，原 UUID 保留。
- 标准 B 描边：84 px 运行图外扩 2 px `#17243A`。
- 评审：`art-review-gs-hot-spring-a-rev1.md`，92/100。

## Phase 4 · 怪物与 Boss

| 顺序 | ID | 任务 | 状态 |
|------|----|------|------|
| 13 | GS-CH1-COMMON | 第一章普通怪 | BLOCKED by player |
| 14 | GS-CH1-ELITE | 第一章 Elite | BLOCKED by common |
| 15 | GS-CH1-BOSS | 哥布林酋长 | BLOCKED by elite |

## Phase 5 · UI Kit

所有任务等待战场、玩家和交互物尺度稳定后开放。
