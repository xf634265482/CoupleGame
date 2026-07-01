# 第一阶段实施计划：成长曲线与模拟基线

> 对应设计：`specs/260701-pve-difficulty-rework/design.md`
> 阶段目标：用可重复数据校准职业进阶、伤害乘区、追加攻击和 Boss 有效生命预算；不实现新怪物或新 Boss 技能。

## 1. 完成定义

第一阶段完成时必须具备：

- 正常成型、强力成型、极限成型三档固定构筑。
- 三职业在第二至第五章的基础攻击、条件攻击、普通怪/精英/Boss 击杀次数报告。
- 射手射程 3 的基准测试场景，记录连续走 A 时敌人的当前接敌能力，作为第二阶段 AI 重构前基线。
- 百分比增伤分组结算，追加攻击不递归复制完整触发链。
- 进阶职业无条件攻击增益进入设计目标区间，高风险或高操作条件仍保留明显峰值。
- 第二至第五章 Boss 的建议生命表，分别对应 8～10、10～12、12～14、14～16 个怪物回合；本阶段不直接将 Boss 改成无机制血牛。
- `npm run test:pve` 全量通过，模拟结果在固定种子下可复现。

## 2. 实施顺序

### Task 0：冻结基线并保护现有工作区

涉及文件：

- `scripts/pve-balance-sim.js`
- `package.json`
- 当前工作区所有未提交文件

操作：

1. 记录 `git status --short`，不覆盖现有未提交改动。
2. 执行当前 `npm run test:pve -- --runInBand`，保存通过数量。
3. 使用当前模拟器执行至少 32 个种子的三职业 reasonable/optimal 基线。
4. 将基线摘要保存为 `specs/260701-pve-difficulty-rework/phase1-baseline.md`，内容包含版本、命令、种子数和核心指标，不提交大型原始日志。

验收：相同命令重复执行时，核心统计结果一致。

### Task 1：建立三档构筑与指标输出

主要文件：

- `scripts/pve-balance-sim.js`
- `test/pve/DifficultyCurve.test.ts`（新增）
- `test/pve/helpers.ts`（仅在现有帮助函数不足时局部扩展）

实现：

1. 在现有 reasonable/optimal 基础上明确三档：
   - `NORMAL`：正常掉落、合理词条选择，不注入传奇套装。
   - `STRONG`：高品质武器、有效职业词条和一件核心传奇。
   - `EXTREME`：高品质完整装备、理想词条和职业关键组合。
2. 每档输出：
   - 面板攻击、有效射程、护甲和关键触发率。
   - 对各章普通怪、精英怪、Boss 的平均/中位击杀攻击次数。
   - 单次攻击 P50/P90/最大伤害。
   - 暴击、连射、追加攻击对总伤害的占比。
3. 所有模拟使用 core RNG 或显式固定输入，禁止引入 `Math.random()`。

验收：测试能够识别“普通构筑稳定一击普通怪”“强力构筑一轮击杀精英”等越界情况。

### Task 2：抽离玩家伤害分组模型

主要文件：

- `assets/scripts/pve/core/PlayerDamageModel.ts`（新增纯逻辑模块）
- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/StrengthenEffects.ts`
- `assets/scripts/pve/core/EquipTraitEffects.ts`
- `assets/scripts/pve/core/AffixSystem.ts`
- `assets/scripts/pve/core/LegendarySystem.ts`
- `test/pve/PlayerDamageModel.test.ts`（新增）
- `test/pve/CombatSystem.test.ts`

模块职责：

- 接收固定攻击、同组百分比加成、独立职业条件、暴击与追加段系数。
- 返回结算后的主攻击伤害及可用于战报/模拟的分组明细。
- 不读取 Cocos、场景或全局状态，不消耗 RNG。

结算顺序：

1. 基础攻击＋职业固定攻击＋武器属性＋固定攻击词条。
2. 通用百分比增伤同组相加后结算一次。
3. 具有独立风险或操作条件的职业倍率结算。
4. 暴击结算。
5. 追加攻击使用显式系数，不重新执行完整主攻击触发链。

迁移要求：先用特征测试锁定未调整组合的当前结果，再逐项迁移，禁止一次性重写 `CombatSystem.ts` 全文件。

### Task 3：校准进阶职业无条件强度

主要文件：

- `assets/scripts/pve/core/PveConstants.ts`
- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/MovementSystem.ts`
- `test/pve/ClassSystem.test.ts`
- `test/pve/CombatSystem.test.ts`
- `test/pve/DifficultyCurve.test.ts`

模拟起点：

- 狂战士固定攻击：`+15 → +8`。
- 射手固定攻击：`+5 → +3`，保留进阶后总射程 3。
- 隐匿者固定攻击：`+10 → +5`，保留移动优势。

调优规则：

- 无条件攻击能力控制在冒险者约 130%～140%。
- 狂战士低血/受击条件、射手距离/节奏条件、隐匿者移动/背刺条件触发后，峰值必须显著超过冒险者。
- 不通过推迟进阶、隐藏职业伤害修正或职业免疫实现平衡。
- 若既有条件词条不足以补回职业峰值，只调整对应条件效果，不回填大额固定攻击。

### Task 4：限制追加攻击与极端乘区

主要文件：

- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/LegendarySystem.ts`
- `assets/scripts/pve/core/strengthen/StrengthenCatalog.ts`
- `test/pve/CombatSystem.test.ts`
- `test/pve/Legendary.test.ts`
- `test/pve/StrengthenCatalog.test.ts`

实现：

- 连射、传奇连击和其他追加段使用 50%～70% 的显式伤害系数，最终值由 Task 1 模拟决定。
- 追加段不得再次触发暴击、连射、额外攻击或“首次攻击”类效果。
- 同类装备百分比、词条百分比和通用增伤统一进入 Task 2 的通用加成组。
- 独立职业条件保留独立倍率，但必须在模型中登记，禁止散落新增未知乘区。
- 更新所有受影响的玩家可见词条与传奇描述，使文案与实际系数一致。

### Task 5：产出 Boss 有效生命预算

主要文件：

- `scripts/pve-balance-sim.js`
- `specs/260701-pve-difficulty-rework/phase1-results.md`（新增）
- `test/pve/DifficultyCurve.test.ts`

计算：

1. 使用 NORMAL 构筑的稳定单回合伤害中位数作为主要基准。
2. 使用 STRONG 构筑验证不会明显低于章节目标回合下界。
3. 使用 EXTREME 构筑验证阶段保护实施后仍无法跳过核心阶段。
4. 分别给出第二至第五章 Boss 的建议基础 HP、章节倍率或最终 HP；不得同时重复放大。

输出必须解释：

- 使用了哪档构筑和多少种子。
- 每章目标回合与建议 HP 的计算关系。
- 当前值与建议值的差距。
- 为何 Boss HP 修改延迟到第三阶段与阶段机制一起合入。

### Task 6：回归、文档同步与提交边界

测试命令：

```bash
npm run test:pve -- --runInBand
node scripts/pve-balance-sim.js --seeds 32
```

文档：

- 更新 `specs/260701-pve-difficulty-rework/phase1-results.md`。
- 将已落地的职业与伤害规则同步到 `specs/260608-pve-destiny-expedition/design.md`。
- 若文件职责发生变化，更新 `PROJECT_NAVIGATION.md`；调用链变化则同步 `CALL_FLOW.md`。

提交边界建议：

1. `test(pve): add difficulty curve fixtures and baseline`
2. `refactor(pve): group player damage modifiers`
3. `balance(pve): calibrate advanced classes and extra attacks`
4. `docs(pve): record phase 1 balance results`

不得夹带工作区中已有的美术、GM、怪物重绘或其他无关改动。

## 3. 风险与回退点

- `CombatSystem.ts` 同时承载大量职业和装备触发，必须通过新纯逻辑模块渐进迁移，不做整文件重写。
- `scripts/pve-balance-sim.js` 当前属于已有工作成果，修改前先确认并保留其现有行为与未提交内容。
- GM `balanceSnapshot` 可能覆盖基础攻击或行动费用；模拟报告必须同时记录默认快照，避免只调客户端常量却被运行时配置抵消。
- 第一阶段只确定 Boss HP 预算，不直接上线纯血量提升；若职业调整先上线，需确保第一章基线测试完全不受影响。

## 4. 第一阶段退出条件

- 第一章核心战斗数值与测试保持现状。
- 三职业进阶后都有清晰优势，但无条件固定攻击不再造成倍数级跃升。
- NORMAL 构筑符合普通怪 2～3 击、精英 4～6 击的目标区间。
- STRONG/EXTREME 构筑的越界项均被报告且有明确处理结论。
- 第二至第五章 Boss HP 建议表完成，可直接供第三阶段逐章实施。
- 全量 PVE 测试通过，模拟可复现，设计主文档已同步。
