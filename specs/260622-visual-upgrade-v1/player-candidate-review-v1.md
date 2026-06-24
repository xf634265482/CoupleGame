# GS-PLAYER-BASE Candidate Review V1

- Date: 2026-06-22
- Style Family: `fate-tower-sky-fantasy-v2`
- Tier: T4 Hero
- Review Evidence: `candidates/player/gs-player-scale-comparison-v1.png`
- Status: REJECTED — human readability veto

> 用户复评：身体装备细节过多，预览与真机尺寸下脸部不清楚；头身比不够 Q 版。  
> 处置：A/B/C 全部否决，不得进入 selected。下一批必须以 64 px 脸部识别为第一目标。

## Locked Invariants

- 棕发、蓝金轻装、青色命运标志。
- Compact Heroic / Compact Knight。
- 自然探索待机，武器收鞘。
- 强完整 Deep Navy Charcoal 轮廓。
- 左上暖主光、右下弱冷填充。
- 玩家在 64 px 必须比普通怪更容易定位。

## Candidate A · 均衡冒险者

- 文件：`candidates/player/gs-player-candidate-a.png`
- 识别点：高领蓝外套、胸前大青晶、收鞘剑柄、厚手套与靴子。
- 优点：整体最亲切，服装层次清楚，接近现有玩家身份。
- 风险：衣摆与腰部小结构略多；青色身份点不如 B 直接。
- 初评：87/100，A · Approved candidate。

## Candidate B · 命运围巾

- 文件：`candidates/player/gs-player-candidate-b.png`
- 识别点：胸前斜向青色围巾、肩后短三角巾尾、棕发与大靴。
- 优点：64 px 下最快定位玩家；青色身份标志不会依赖细小水晶；轻装探索感最符合默认冒险者。
- 风险：围巾颜色需要最终压低约 5%~10% 饱和度；头身还需在正式修订时再压向精确 2.3。
- 初评：91/100，A · Recommended。

## Candidate C · 轻骑士

- 文件：`candidates/player/gs-player-candidate-c.png`
- 识别点：非对称大肩甲、胸前青晶、外露剑柄。
- 优点：英雄感与装备层次最强。
- 风险：甲片偏重，更像职业进阶或骑士职业；默认探索者的轻巧与亲和感下降，头身视觉也最修长。
- 初评：82/100，B · Rework，不建议作为默认玩家。

## Recommendation

推荐选择 **B** 进入正式修订：

1. 保留脸型、棕发、蓝金轻装和短青色围巾。
2. 将身体比例进一步压缩到精确 2.3 头身。
3. 简化腰带与护腿细节，保证 64 px 不糊。
4. 青色围巾降低少量饱和度，避免抢过危险预警。
5. 正式输出 1024×1024，约 10% 透明边，不带地面、投影或光环。

用户选择前，三个候选均不得覆盖 `assets/resources/art/ui/pve/map/icon_player.png`。
