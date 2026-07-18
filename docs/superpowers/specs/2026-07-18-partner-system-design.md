# 伙伴系统设计

> 日期：2026-07-18  
> 状态：核心已落地（大厅入口/面板、档案、快照经验、六类技能执行器、HUD、战斗接线）；视觉跟随与部分阶段钩子可继续打磨  
> 产品规格来源：`塔塔远征团-伙伴系统设计与开发规格V1.md`  
> 对应主设计：`specs/260608-pve-destiny-expedition/design.md` §7.1  
> 架构路径：统一技能执行框架（`core/partner/` + `usePartnerSkill`）

---

## 1. 定位与硬边界

伙伴是**主动战术技能 + 外观进化陪伴角色**，不是第二命痕、传统属性宠或独立战斗单位。

| 允许 | 禁止 |
|---|---|
| 每场携带 1 名 | 占棋盘格 / 参与寻路 / 阻挡移动 |
| 玩家主动释放 1 个核心技能 | 独立 AI / 自动攻击 / 独立 HP |
| 每层基础使用 1 次 | 成为关卡强制通关条件 |
| 四阶段外观与机制进化 | 攻击/生命/暴击常驻百分比堆叠 |
| 大厅陪伴展示 | 羁绊等级、伙伴装备、技能树、抽卡 |

职责边界：

- **职业 / 装备 / 命运成长**：基础战斗方式与长期数值  
- **命痕**：关卡前配置的被动/条件触发战术工具  
- **伙伴**：战斗中最关键的一次主动战术窗口  

---

## 2. 已确认产品决策

| 项 | 决策 |
|---|---|
| 大厅入口 | 底栏第 2 格（排行榜 ↔ 远征），替换原「遗物」语义位；当前工程无独立遗物系统 |
| 首版解锁 | 六只伙伴默认全解锁（正式投放条件后续再接） |
| 进化材料 | 扣星尘 `gold`；建议消耗 50 / 200 / 500（可配置常量） |
| 进化试炼 | 接口 `hasCompletedPartnerTrial(partnerId, stage)` 首版恒 `true`；正式关卡测通后再接 |
| 等级门槛 | Stage2@Lv5 / Stage3@Lv15 / Stage4@Lv30 |
| 经验来源 | 主要：携带该伙伴通关一层；首版不做喂养道具 |
| 默认装备 | 新档 / 迁移默认 `MOBILITY` |
| 战斗 HUD | 见 §6 |

---

## 3. 架构总览

```
PveLobbyController ──底栏第2格──► PartnerController / PartnerView
                                       │
PveProfile.partners + equippedPartnerId ◄─┘  养成 / 装备 / 进化
                                       │
FloorChallengeConfigSnapshot ──开局冻结 partnerId + evolutionStage
                                       │
ExpeditionController / PveHudView ──伙伴按钮──► PartnerSkillExecutor.usePartnerSkill
                                       │
         复用 shield / heal / spirit / armorPen / tempAP / moveCost / displace 修正
                                       │
FogMapView ──仅视觉跟随节点（不进 monsters[]）
```

核心模块（建议路径）：

| 模块 | 职责 |
|---|---|
| `pve/core/partner/PartnerTypes.ts` | ID / stage / 进度类型 |
| `pve/core/partner/PartnerCatalog.ts` | 六伙伴定义与阶段技能配置 |
| `pve/core/partner/PartnerProgression.ts` | 经验、进化校验、扣星尘 |
| `pve/core/partner/PartnerSkillExecutor.ts` | `usePartnerSkill` 统一分发 |
| `pve/core/partner/PartnerBattleState.ts` | 本层 `skillUsed` 与临时标记 |
| `pve/core/partner/PartnerTrial.ts` | 试炼接口（首版恒通过） |
| `pve/controllers/PartnerController.ts` + `views/PartnerView.ts` | 大厅面板 |
| 最小扩展 | 瞬移落点 API、选格/选敌 aim 态、轻量临时标记 |

禁止：每伙伴独立战斗 Controller；把伙伴效果塞进命痕钩子主路径；伙伴进 `monsters[]`。

---

## 4. 数据、存档与迁移

### 4.1 永久档案（`PveProfile`）

```ts
type PartnerId =
  | 'MOBILITY'
  | 'GUARD'
  | 'BREAKER'
  | 'CONTROL'
  | 'ANIMA'
  | 'HEAL';

interface PlayerPartnerProgress {
  unlocked: boolean;
  level: number;          // 从 1
  exp: number;
  evolutionStage: 1 | 2 | 3 | 4;
}

// PveProfile 新增：
partners: Record<PartnerId, PlayerPartnerProgress>;
equippedPartnerId: PartnerId | null;
```

### 4.2 迁移

- **不抬** `PVE_PROFILE_VERSION`（避免硬重置）。  
- 在客户端 `PveProgressionTypes` 与云端 `PveProfile.js` 的 `createDefaultProfile` / `normalizeProfile` 软补全：  
  - 缺字段 → 六只 `unlocked: true`，`level: 1`，`exp: 0`，`evolutionStage: 1`  
  - `equippedPartnerId` 缺省 → `'MOBILITY'`  
- 改 `cloudfunctions/common/**` 后必须 `node scripts/sync-cloud-common.js`。

### 4.3 开局快照

`FloorChallengeConfigSnapshot` 增加：

- `partnerId: PartnerId | null`  
- `partnerEvolutionStage: 1 | 2 | 3 | 4`  
- `partnerLevel: number`（冻结开局等级；技能阶段只读 `evolutionStage`，等级仅用于展示/结算经验）  

进入楼层后不可更换；返回大厅可更换。伙伴不占命痕槽、不占装备槽。

### 4.4 本层运行态

```ts
interface PartnerBattleState {
  partnerId: PartnerId;
  evolutionStage: 1 | 2 | 3 | 4;
  skillUsed: boolean;
  // 临时标记：移动减费、破甲目标、缓域目标、灵潮余响等
  flags: string[];
  // 按需附加字段（破甲目标 id、缓域剩余等）
}
```

在 `startFloorRuntime` / 新楼层工厂中重置 `skillUsed = false`（模式对齐 `legEternalPlateUsed` 等 once-per-floor 标志）。

---

## 5. 养成与进化

| 阶段 | 门槛 | 星尘（建议） | 试炼 |
|---|---|---|---|
| 1 → 2 成长 | Lv ≥ 5 | 50 | 无 |
| 2 → 3 进化 | Lv ≥ 15 | 200 | 接口（首版恒 true） |
| 3 → 4 觉醒 | Lv ≥ 30 | 500 | 接口（首版恒 true） |

- 经验：携带通关结算写入。首版公式固定为 **`30 + clearedFloor`**（通关第 N 层得 `30+N` XP）；仅装备中的伙伴获得。  
- 进化成功：`evolutionStage += 1`，扣星尘；外观资源 key 按 stage 切换。  
- 首版不做：羁绊、好感、伙伴装备、洗练、多技能、升星抽卡。

---

## 6. UI

### 6.1 大厅

- 底栏顺序：排行榜 | **伙伴** | 远征 | 营地  
- 点击打开 `PartnerView`：列表（头像/等级/阶段/已装备）+ 详情（技能说明、下一阶段变化、经验、进化条件）+ 装备 / 进化  
- 当前装备伙伴在大厅角色附近轻量视觉跟随（首版静态/简单待机占位即可）

### 6.2 战斗 HUD 改版（与伙伴同批）

| 位置 | 改动 |
|---|---|
| 右上 | 去掉远征内无用的「星尘」与职业标；「角色」移到灵气条下方，与「目标」并列 |
| 左下原「角色」位 | 改为「伙伴」技能按钮（头像 / 可用 / 本层已用灰显） |
| 蓄力按钮文案 | `蓄力 0 AP` → 单行 **`蓄力 0`**（数字随当前蓄力变化，不加 `AP`） |
| 右侧列 | 攻击 / 互动 / 灵气爆发 **不变** |

技能按钮状态：可用高亮；选目标/选格时进入 aim 态；已用灰显并提示「本层已使用」。

---

## 7. 战斗技能执行

### 7.1 统一入口

```ts
usePartnerSkill(ctx) →
  校验：玩家可操作阶段 / 未死亡 / !skillUsed / 有携带伙伴
  → 按 PartnerId/Type 分发 handler
  → { nextRuntime, events, needTargetSelection? }
  → 成功则 skillUsed = true
```

默认禁止：怪物行动中、动画锁定、结算态、死亡后、楼层结束后使用。

### 7.2 六类映射（规格数值）

| ID | 幼生 | 成长 | 进化 | 觉醒 | 复用/扩展 |
|---|---|---|---|---|---|
| MOBILITY | 2 格瞬移 | 3 格 | 下一次主动移动 AP-1（最低 1） | 4 格；危险落点盾 6% maxHp | **新瞬移 API**；moveCost；shield% |
| GUARD | 盾 15% | 20% | 至下回合开始前首次强制位移 -1（最低 0） | 护盾留到下回合开始 → +1 临时 AP（每技能最多一次） | shield%；forcedDisplaceReduction；tempAP |
| BREAKER | 选敌破甲 30% | 45% | 命中后目标下一次主动攻击最终伤害 -20% | 「破绽」至本玩家回合结束，下一次对该目标主动攻击再 +15% 破甲 | armorPenetration；选敌 aim；目标标记 |
| CONTROL | 周围 2 格移速 -1 | 3 格 | 受影响普通/精英下次强制位移 +1（Boss 不受） | 移速被压至 0 时：普精下击 -20% / Boss -10% | 释放时范围查询一次；怪临时标记 |
| ANIMA | +25% spirit | +35% | 本回合内爆发结束后 +1 临时 AP（每灵潮一次） | 因此满槽则爆发结束后盾 6% | SpiritBurstSystem；tempAP；shield% |
| HEAL | 疗 15% | 20% | HP≤40% 额外 +5% | 过量治疗 50% 转盾（上限 10% maxHp） | heal + overheal→shield |

瞬移规则：不耗 AP；不经中间路径；不触发中间地形；落点进入效果正常；拒绝占格与禁入格；只检查最终落点标签（觉醒危险判定），禁止为「跨越了什么」做完整寻路。

控场规则：移动能力最低 0；Boss 移动削减最多 1 格；不跳过敌人行动、不范围冻结、不永久控制。

灵气规则：不直接加爆发伤害；只改爆发时机与爆发后衔接/生存。

### 7.3 视觉跟随

- 仅 view 层节点，跟随玩家精灵偏移  
- 不进 `monsters[]`，不参与碰撞/仇恨/Boss 目标  

---

## 8. 最小通用能力扩展清单

实现前必须具备或补齐：

1. **瞬移落点**（无路径移动）  
2. **选格 / 选敌 aim 模式**（复用 focus + 合法格高亮）  
3. **轻量临时标记**（string flags / 本层字段；无独立 Update 循环）  
4. 已有：shield%、heal/overheal、spirit、armorPenetration、temp AP、move cost reduction、forced displace reduction  

---

## 9. 测试

`test/pve/` 优先覆盖：

- 六类幼生效果 + 阶段关键差异  
- 每层一次；非法阶段拒绝释放  
- 瞬移：路径无关、占格拒绝、落点效果  
- `normalizeProfile` 迁移；快照冻结；通关经验；进化扣星尘  
- 伙伴不在 `monsters[]` / 不进入 MonsterAI  

---

## 10. 文档与导航同步（实现阶段）

- 更新 `specs/260608-pve-destiny-expedition/design.md`（伙伴专节）  
- 更新 `PROJECT_NAVIGATION.md` / `CALL_FLOW.md`  
- 本文件为实现前确认稿；落地后可将状态改为「已落地」  

---

## 11. 首版范围 / 非范围

**做：**

1. 大厅底栏入口 + 伙伴面板（列表/详情/装备/进化）  
2. 大厅轻量跟随展示  
3. 等级经验 + 四阶段框架 + 星尘进化  
4. 试炼接口（恒通过）  
5. 六类技能 + 战斗按钮 + 每层一次  
6. HUD 改版（角色上移、伙伴按钮、蓄力文案、去星尘/职业标）  
7. 存档迁移 + 开局快照  
8. 单测 + 占位外观资源 key 接入能力  

**不做：**

羁绊/好感/复杂大厅互动数值、伙伴装备、多主动技能、被动技能树、随机品质、抽卡、真实试炼关卡。

---

## 12. 验收标准

1. 大厅可查看、进化、装备伙伴；底栏入口可用。  
2. 每场只能携带 1 名；战斗内正确显示。  
3. 伙伴不参与棋盘单位逻辑与 AI。  
4. 每名伙伴一个核心主动技能，由玩家主动释放，每层基础 1 次。  
5. 六类战术职责可辨；第三、四阶段有机制变化而非纯数值膨胀。  
6. 不与命痕职责重合；关卡不依赖指定伙伴通关。  
7. 无每帧扫盘、无独立伙伴 AI。  
8. HUD 改版符合 §6.2。  
