/**
 * PveReward 单测（Phase 6 AC-EQ-10）
 * 覆盖：通关奖励计算、通关大礼包、首通额外奖励、难度档倍率。
 */
const { computeSettleReward, isBossFloor, countClearedBossFloors } = require('../pve/PveReward');
const { PVE_SETTLE_REWARD, PVE_TOTAL_FLOORS } = require('../constants');

describe('isBossFloor / countClearedBossFloors', () => {
  it('第 7、14、21、28、35 层为 Boss 层', () => {
    [7, 14, 21, 28, 35].forEach((f) => expect(isBossFloor(f)).toBe(true));
    [1, 5, 6, 8, 34].forEach((f) => expect(isBossFloor(f)).toBe(false));
  });

  it('countClearedBossFloors 按整除7计数', () => {
    expect(countClearedBossFloors(0)).toBe(0);
    expect(countClearedBossFloors(7)).toBe(1);
    expect(countClearedBossFloors(14)).toBe(2);
    expect(countClearedBossFloors(35)).toBe(5);
  });
});

describe('computeSettleReward — 基础层数奖励', () => {
  it('死亡在第1层（未通过）→ 0 层奖励', () => {
    const r = computeSettleReward(1, 'DEAD', 'NORMAL');
    expect(r.floorsCleared).toBe(0);
    expect(r.diamond).toBe(0);
    expect(r.destinyShards).toBe(0);
    expect(r.completionBonus).toBe(false);
    expect(r.firstClearBonus).toBe(false);
  });

  it('死亡在第8层 → 已通7层（含1个Boss）', () => {
    const r = computeSettleReward(8, 'DEAD', 'NORMAL');
    expect(r.floorsCleared).toBe(7);
    const expectedDiamond = 7 * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR + 1 * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR;
    const expectedShard = Math.round((7 * PVE_SETTLE_REWARD.SHARD_PER_FLOOR + 1 * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR) * 1.0);
    expect(r.diamond).toBe(expectedDiamond);
    expect(r.destinyShards).toBe(expectedShard);
  });

  it('COMPLETED 在第35层 → 35层已结清', () => {
    const r = computeSettleReward(35, 'COMPLETED', 'NORMAL');
    expect(r.floorsCleared).toBe(35);
  });
});

describe('computeSettleReward — 通关大礼包（Phase 6 AC-EQ-10）', () => {
  it('全通35层（COMPLETED + floor=35）→ completionBonus=true，包含大礼包奖励', () => {
    const r = computeSettleReward(35, 'COMPLETED', 'NORMAL');
    expect(r.completionBonus).toBe(true);
    // 基础层数 + 大礼包
    const baseFloor = 35 * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR + 5 * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR;
    expect(r.diamond).toBe(baseFloor + PVE_SETTLE_REWARD.COMPLETION_BONUS_DIAMOND);
    const baseShard = 35 * PVE_SETTLE_REWARD.SHARD_PER_FLOOR + 5 * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR + PVE_SETTLE_REWARD.COMPLETION_BONUS_SHARD;
    expect(r.destinyShards).toBe(Math.round(baseShard * 1.0)); // NORMAL multiplier = 1.0
  });

  it('死亡在第35层 → 已通34层，没有通关大礼包', () => {
    const r = computeSettleReward(35, 'DEAD', 'NORMAL');
    expect(r.completionBonus).toBe(false);
    expect(r.floorsCleared).toBe(34);
  });

  it('COMPLETED 在第34层（非全通）→ 无通关大礼包', () => {
    const r = computeSettleReward(34, 'COMPLETED', 'NORMAL');
    expect(r.completionBonus).toBe(false);
  });
});

describe('computeSettleReward — 首通额外奖励', () => {
  it('首通 NORMAL（isFirstClear=true + 全35层）→ firstClearBonus=true，含额外奖励', () => {
    const r = computeSettleReward(35, 'COMPLETED', 'NORMAL', true);
    expect(r.firstClearBonus).toBe(true);
    expect(r.completionBonus).toBe(true);
    // 必含首通额外奖励数值
    const withoutFirst = computeSettleReward(35, 'COMPLETED', 'NORMAL', false);
    expect(r.diamond).toBe(withoutFirst.diamond + PVE_SETTLE_REWARD.FIRST_CLEAR_DIAMOND_BONUS.NORMAL);
    expect(r.destinyShards).toBe(withoutFirst.destinyShards + PVE_SETTLE_REWARD.FIRST_CLEAR_SHARD_BONUS.NORMAL);
  });

  it('首通 NIGHTMARE → 首通碎片更多', () => {
    const rN = computeSettleReward(35, 'COMPLETED', 'NORMAL', true);
    const rNM = computeSettleReward(35, 'COMPLETED', 'NIGHTMARE', true);
    expect(rNM.destinyShards).toBeGreaterThan(rN.destinyShards);
  });

  it('非首通（isFirstClear=false）→ firstClearBonus=false', () => {
    const r = computeSettleReward(35, 'COMPLETED', 'HARD', false);
    expect(r.firstClearBonus).toBe(false);
    // 还有通关大礼包，但没有首通额外
    expect(r.completionBonus).toBe(true);
  });

  it('首通但未全通35层（死亡）→ 无首通额外', () => {
    const r = computeSettleReward(20, 'DEAD', 'NORMAL', true);
    expect(r.firstClearBonus).toBe(false);
    expect(r.completionBonus).toBe(false);
  });
});

describe('computeSettleReward — 难度碎片倍率', () => {
  it('HARD（shardMult=1.15）碎片多于 NORMAL', () => {
    const rN = computeSettleReward(14, 'DEAD', 'NORMAL');
    const rH = computeSettleReward(14, 'DEAD', 'HARD');
    expect(rH.destinyShards).toBeGreaterThan(rN.destinyShards);
    expect(rH.diamond).toBe(rN.diamond); // 钻石不受倍率影响
  });

  it('INFERNO（shardMult=1.75）通关奖励最高', () => {
    const rN = computeSettleReward(35, 'COMPLETED', 'NORMAL', false);
    const rI = computeSettleReward(35, 'COMPLETED', 'INFERNO', true);
    expect(rI.destinyShards).toBeGreaterThan(rN.destinyShards);
  });

  it('未知难度档降级为 NORMAL 倍率', () => {
    const rN = computeSettleReward(10, 'DEAD', 'NORMAL');
    const rX = computeSettleReward(10, 'DEAD', 'UNKNOWN_TIER');
    expect(rX.destinyShards).toBe(rN.destinyShards);
  });
});
