# 2-5 章内容深化 — Design

> 范围：关卡/Boss 强度调整完成后立即接续的"内容深度补全"，覆盖三项最影响 2-5 章体验的缺口。
> 关联：[Boss设计V1](../game-design/Boss设计V1.md)、[地图与探索系统V1](../game-design/地图与探索系统V1.md)、[战斗系统V1](../game-design/战斗系统V1.md)、[数值系统V1](../game-design/数值系统V1.md)、[经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md)。
> 决定日期：2026-06-13。

## 目标

让 2-5 章在"强度合理"之外，达到"内容密度不输第 1 章"的水准。具体三件事：

1. **Boss 机制深化**：2-5 章 Boss 从"专属机制 + 普通近战"升级为"专属机制 + 1 个新增层（地形/阶段/增援/AOE 预警之一）"。
2. **2-5 章逐层怪物规则**：模仿第 1 章的 `generateChapter1Monsters`，让每章 4 个普通层有差异化怪物配比。
3. **HELMET baseStat 接入战斗**：补一行 `player.maxHp += helmet?.baseStat`，把已设计未生效的头盔属性接通。

## 一、Boss 机制深化

### 1.1 现状

| 章 | Boss | 当前已实现机制 |
|---|---|---|
| 1 | GoblinChief | 重击预警(HEAVY_STRIKE_WARNING) + 增援号角(HORN_INTERVAL) + 石块地形(ROCK) ✅ 完整 |
| 2 | QuicksandScorpion | `quicksandScorpionBurrow` 周期性钻地隐身 |
| 3 | FrostGiant | `isFreezeAttackTurn` 周期性冰冻 AOE |
| 4 | LavaLord | DOT 灼烧 |
| 5 | FateGuardian | `fateGuardianEvade` 闪避 |

差距：2-5 章每个 Boss 只有 1 个专属机制，缺"地形/阶段/增援"中至少一项。

### 1.2 目标方案

每个 Boss 新增 1 个机制层（不动现有的，加层而非改层），保持与第 1 章相当的"信息密度"：

| Boss | 现有保留 | 新增机制 | 理由 |
|---|---|---|---|
| QuicksandScorpion | 钻地 | **沙坑地形**（`SAND_PIT`）：玩家踩入移动 AP+1，Boss 钻出时优先从最近沙坑出，玩家可借此预判 | 让"钻地"从被动等变成主动博弈 |
| FrostGiant | 冰冻 AOE | **冰墙地形**（`ICE_WALL`）：Boss 房刷 2-3 个冰墙阻挡视线/移动，玩家可攻击破坏（HP=10），破坏后掉落 1 灵气 | 给冰章一个"打地形换资源"的小循环 |
| LavaLord | DOT 灼烧 | **熔岩潮汐阶段**：HP ≤ 50% 时切入第二阶段，每 3 回合在棋盘随机 3 格刷 `LAVA_TILE`（持续 2 回合），玩家踩入受 5 伤 | 阶段切换 + AOE 预警，给"残血更危险"的紧张感 |
| FateGuardian | 闪避 | **镜像分身**：HP ≤ 33% 时召唤 1 个"命运镜像"（HP=20，攻击=Boss 攻击的 50%），镜像与本体共享伤害池但不共享 HP（玩家可专打镜像或本体） | 终章 Boss 需要"选择优先级"的决策 |

### 1.3 共同约束

- 所有新增地形/实体走现有 `FixedEntity` 模型，地图生成时由 `generateFloor` 的 Boss 分支添加。
- 新增事件类型加入 `PveEvent` 联合：`SAND_PIT_STEPPED`、`ICE_WALL_BROKEN`、`LAVA_TIDE_SPAWNED`、`MIRROR_SPAWNED`、`MIRROR_KILLED`。
- 数值占位（具体数值在 plan 实施时调试，design 仅给量级）：
  - 沙坑数量：4
  - 冰墙数量：3，HP 10
  - 熔岩潮汐周期：3 回合，每次 3 格，单格伤害 5，持续 2 回合
  - 镜像 HP：20，攻击系数：0.5

## 二、2-5 章逐层怪物规则

### 2.1 现状

`generateChapter1Monsters` 为第 1 章 4 个普通层各设了不同怪物配比；2-5 章全部走 `NORMAL_MONSTER_COUNT=4 + ELITE_MONSTER_COUNT=1 + ANIMA_MONSTER_COUNT=1` 的固定配比，玩家会感到"每层都一样"。

### 2.2 目标方案

为 2-5 章引入"章节怪物变体表 + 逐层配比"：

```
generateChapterMonsters(chapter, flInChapter, ...) →
  查 CHAPTER_MONSTER_RULES[chapter][flInChapter]
  → { 变体ID: 数量 } 的字典
```

`CHAPTER_MONSTER_RULES` 表骨架（具体变体在 plan 实施时按章节主题定，design 给框架）：

| 章 | 主题 | 怪物变体（含已有 + 新增） |
|---|---|---|
| 2 | 沙漠 | 沙漠游击手（远程，沙坑相关）、沙虫幼体（钻地）、毒蝎（DOT）、灵气甲虫 |
| 3 | 冰原 | 冰霜哥布林复用 + 雪狼（高速移动）、冰史莱姆（被击中分裂）、灵气精灵 |
| 4 | 熔岩 | 赤炎哥布林复用 + 火焰元素（自爆 AOE）、岩浆蟹（高护甲）、灵气炎魂 |
| 5 | 命运回廊 | 影子刺客（隐形）、命运守望者（小镜像）、时空虫（每次移动两格）、灵气幻象 |

每章 4 个普通层的配比按"渐进引入"原则：
- 第 1 层：基础 2 种怪物，量少
- 第 2 层：加入 1 个该章特色怪物
- 第 3 层（铁匠层）：怪物数稍降，给玩家强化窗口
- 第 4 层：怪物数最高 + 1 个精英变体，作为 Boss 前夜

### 2.3 实施分阶段

- **P0（本批必做）**：把 `generateChapter1Monsters` 抽成 `generateChapterMonsters(chapter, ...)` 的通用框架，让 2-5 章也能查表，但 2-5 章先用现有"通用怪物 + 数量微调"填充。
- **P1（后续批次）**：补 2-5 章新增变体的 `Chapter{2,3,4,5}Monsters.ts`。

design 仅承诺 P0 落地；P1 单列为后续 spec。

## 三、HELMET baseStat 接入

### 3.1 现状

[经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §2.1 标注 HELMET `baseStat` 含义为"最大生命值加成（占位）"。模板表给出 COMMON=2 ~ LEGENDARY=14 的数值（[数值系统V1](../game-design/数值系统V1.md) §六），但玩家初始化与装备替换时未读取。

### 3.2 目标方案

在玩家"获得头盔"和"卸下头盔"两个时机调整 `maxHp`：

- 装备时：`player.maxHp += newHelmet.baseStat`；若没旧头盔，`player.hp` 同步 +baseStat（避免出现 hp/maxHp 比例怪）
- 替换时：`player.maxHp += (new.baseStat - old.baseStat)`；hp 不变（已有的不补，不超过新 maxHp 即可）

落点：`LootSystem.applySimpleDrop` / `LootSystem.openChest` / `NeutralEntities.upgradeEquip` 这三处会改 `player.equipment.HELMET` 的位置。

需新增统一 helper：`equipHelmet(state, newHelmet) → ApplyResult`，三处都调它，避免散落的 maxHp 加减漏改。

## 四、验收

- AC-301：第 2-5 章 4 个 Boss 各自的新增机制（沙坑/冰墙/熔岩潮汐/镜像）在 ts-jest 中可被独立测试通过。
- AC-302：`generateChapterMonsters` 接受 `chapter` 参数；第 1 章行为与重构前完全一致（已有的 ch1 测试不变绿即回滚）。
- AC-303：拾取/替换/铁匠强化 HELMET 后，`player.maxHp` 正确变化；同一槽位的旧头盔卸下后 maxHp 同步回扣。
- AC-304：所有新增 `PveEvent` 在 `战报系统`（[战斗系统V1](../game-design/战斗系统V1.md) §九）可渲染出对应文案。
- AC-305：跨端确定性（AC-13）保持：同 seed 的 Boss 行为与新地形布局可复算。

## 五、不在本批范围

- M2 装备词条 atk/def/hp 三条接入战斗（独立 spec）
- 完整 15 词条灵气强化池（独立 spec）
- 2-5 章新增怪物变体的具体数值/词条（本批只搭框架，P1 单独 spec）
- 服务端下发 runSeed（独立 spec）
- UI 启动 spinner / 耗时埋点（独立 spec）
