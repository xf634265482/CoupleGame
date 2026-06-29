# 成长节奏 V3 实施计划

> 设计：本目录 `design.md`（唯一真相源，实现前必读）。
> 玩法主文档：`specs/260608-pve-destiny-expedition/design.md`（改完同步）。
> 必守工程约束：见根 `CLAUDE.md` —— 云函数只改 `cloudfunctions/common/`，改完跑 `node scripts/sync-cloud-common.js`；`pve/core/` 零 `cc` 依赖、禁止裸 `Math.random()`（用 `core/rng.ts`）；PVE 单测在根 `test/pve/`，跑 `npm run test:pve`。
> 全部改动确定性必须可云端复算（AC-13）：同 seed + 同操作序列结果一致。

按 Phase 顺序推进，每个 Phase 自带验收，绿了再进下一个。

---

## Phase A — 结构（低风险，先上）

目标：7 层/章、35 层通关硬上限、删除退化层、章内配怪扩到 1-6。

1. `assets/scripts/pve/core/PveConstants.ts`
   - `FLOORS_PER_CHAPTER` 5 → 7（`TOTAL_FLOORS` 自动 = 35）。
   - 确认 `chapterOfFloor` / `isBossFloor` / `mapSizeOfFloor` 全部基于 `FLOORS_PER_CHAPTER`，无硬编码 5/25/10/15/20（Boss 层会自动变 7/14/21/28/35）。
2. `assets/scripts/pve/core/ChapterMonsterRules.ts`
   - `CHAPTER_MONSTER_RULES` 每章从「章内 1-4」扩到「章内 1-6」（Boss 在章内 7）。
   - 章内第 3 层 = 精英关卡（精英怪 ≥ 2），其余按 design §2.2 节拍填充本章已有变体。
3. `MapGenerator.ts` 温泉规则：随 `FLOORS_PER_CHAPTER`=7 改为每章 **2 个温泉**（章内第 4 层精英后 + 第 6 层 Boss 前），见 design §4b.3；如加第 2 泉则评估 `HOT_SPRING_HEAL_RATIO` 0.4→0.3。
4. 第 35 层通关：`ExpeditionState` / `ExpeditionController` 流程中，击败第 35 层 Boss 后走「通关」结算与结局表现，**不生成第 36 层**；确保 `chapterOfFloor` 永远 ≤ 5（无 `bossId=undefined`）。
5. `cloudfunctions/common/pve/PveValidate.js`：层数连续性上限 25 → 35。改完跑 sync 脚本。
6. 校验：`npm run test:pve` 全绿；既有快照/确定性测试若因层数变化失败，更新预期值（不是改逻辑）。

**Phase A 验收**：AC-P3-1、AC-P3-2、AC-P3-3。

---

## Phase B — 碎片与觉醒节奏

目标：碎片保底+概率+允许重复+进阶后偏向；觉醒落点落在第 21-22 层。

1. `assets/scripts/pve/core/MapGenerator.ts`
   - `generateFloor()` 需感知玩家当前 `classId`（改签名传入或注入 floorState 快照）——偏向规则依赖它。
   - 碎片生成：保底 1 + 第 2 个 70% + 第 3 个 25%（首发值）；**移除「强制不同职业」**，允许同职业重复。
   - 偏向：`classId === 'ADVENTURER'` → 三职业等权；否则 70% 主职业 / 各 15% 另两职业。
   - 全程走 `core/rng.ts`，不破坏确定性。
2. 进阶/觉醒阈值：`CLASS_FRAGMENTS_TO_ADVANCE` **5 → 7**（目标进阶落点第 8-10 层，已定）；`CLASS_FRAGMENTS_TO_AWAKEN=10`、`AWAKEN_SECONDARY_TOTAL=7`、`AWAKEN_REQUIRED_CHAPTER=3` 保持不变（觉醒落点靠章节加长 + 偏向自然前移）。
3. 新增蒙特卡洛模拟测试（`test/pve/`）：跑 N 次远征，统计一阶进阶 / 觉醒的层数分布 + **每章灵气强化次数**。
   - **门槛**：一阶进阶层数中位数 ∈ **[8,10]**；觉醒层数中位数 ∈ [20,23]；第 4-5 章强化 ≥ 1 次/章。
   - 进阶/觉醒不达标 → 调阈值或 §3.1 概率；强化次数不达标 → 调灵气收入或系数（见 design §4b.1）。
4. 局内平衡（design §4b，数值待模拟/玩测）：
   - `INITIAL_HP` 230 → 上调（参考 280~300）；⚠️ 同时确认 `PveConstants.ts` 末尾调试标记已清零（约 line 597）。
   - 灵气曲线：按 §4b.1 在收入缩放 / 系数 1.5→1.35 / 线性尾巴中择一改。

**Phase B 验收**：AC-P3-4、AC-P3-5。

---

## Phase C — 难度档与排行榜（与 destiny-tree-v2 Phase 4 合并实现）

目标：难度档「仅通关上一档解锁」、复合排行榜、云端校验与迁移。

1. 难度档运行时：开局选难度 → 倍率（HP/伤害/碎片奖励，沿用 `260628-destiny-tree-v2` §3 表）冻结进存档；续档沿用快照（与 destiny-tree-v2 §7.2 合并）。
2. 解锁机制（**仅通关上一档第 35 层**，命运阶位不参与）：
   - `cloudfunctions/common/pve/PveSave.js`：开局校验「上一档是否已通关」，否则拒绝（如 `PVE_DIFFICULTY_LOCKED`）。
   - `cloudfunctions/common/pve/PveMeta.js`：记录各难度档通关状态，供解锁校验。
3. 排行榜复合键：
   - `users` 新增 `pveHighestTier`；结算仅当 `(tier, floor)` 严格高于历史最高时更新（`PveReward.js` / `PveSave.js`）。
   - `myRank` 公式改「先比 tier 再比 floor」；排序 `(难度档 ↓, 档内最深层 ↓, 首次到达时间 ↑)`。
   - 老账号 `pveHighestTier` 缺省 = 普通。
4. UI：开局难度选择、锁定档显示解锁条件；排行榜总榜 + 按难度筛选切页 + 难度徽章。
5. 云端改完跑 `node scripts/sync-cloud-common.js`。

**Phase C 验收**：AC-P3-6、AC-P3-7、AC-P3-9、AC-P3-10、AC-P3-8（通关不重置树）。

---

## 收尾

- 同步 `specs/260608-pve-destiny-expedition/design.md` 的 §2.2 / §3 / §8 正文（顶部已有 V3 变更条目指向本设计）。
- 如 PROJECT_NAVIGATION.md / CALL_FLOW.md 的入口因签名变化失准，一并更新。
