const { validateSaveFloorReport, validateSettleReport } = require('../pve/PveValidate');
const { isBossFloor, countClearedBossFloors, computeSettleReward } = require('../pve/PveReward');
const { canUnlockNode, getNodeDef } = require('../pve/PveDestinyTree');
const { PVE_SETTLE_REWARD } = require('../constants');

function makeSave(overrides = {}) {
  return {
    runSeed: 12345,
    status: 'ACTIVE',
    chapter: 1,
    floor: 3,
    player: {},
    floorState: {},
    version: 0,
    ...overrides,
  };
}

describe('PveValidate', () => {
  describe('validateSaveFloorReport — 层号连续性 / 种子一致性（AC-14）', () => {
    it('无存档时必须从第 1 层开始，否则判为不连续', () => {
      expect(() => validateSaveFloorReport(null, { runSeed: 1, floor: 1 })).not.toThrow();
      expect(() => validateSaveFloorReport(null, { runSeed: 1, floor: 2 })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
    });

    it('已有存档时层号必须紧接当前存档推进一层', () => {
      const save = makeSave({ floor: 3 });
      expect(() => validateSaveFloorReport(save, { runSeed: save.runSeed, floor: 4 })).not.toThrow();
      expect(() => validateSaveFloorReport(save, { runSeed: save.runSeed, floor: 5 })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
      expect(() => validateSaveFloorReport(save, { runSeed: save.runSeed, floor: 3 })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
    });

    it('runSeed 与现有存档不一致时拒绝（杜绝中途换种子伪造进度）', () => {
      const save = makeSave({ runSeed: 12345, floor: 3 });
      expect(() => validateSaveFloorReport(save, { runSeed: 99999, floor: 4 })).toThrow(
        expect.objectContaining({ code: 'PVE_SEED_MISMATCH' }),
      );
    });

    it('floor / runSeed 非法时拒绝', () => {
      expect(() => validateSaveFloorReport(null, { runSeed: 1, floor: 0 })).toThrow(
        expect.objectContaining({ code: 'PVE_INVALID_FLOOR' }),
      );
      expect(() => validateSaveFloorReport(null, { runSeed: 'x', floor: 1 })).toThrow(
        expect.objectContaining({ code: 'PVE_INVALID_SEED' }),
      );
    });
  });

  describe('validateSettleReport — 结算层号边界 / 状态合法性（AC-14）', () => {
    it('结算层号只能停留在当前存档层或恰好推进一层', () => {
      const save = makeSave({ floor: 3 });
      expect(() => validateSettleReport(save, { runSeed: save.runSeed, floor: 3, status: 'DEAD' })).not.toThrow();
      expect(() => validateSettleReport(save, { runSeed: save.runSeed, floor: 4, status: 'DEAD' })).not.toThrow();
      expect(() => validateSettleReport(save, { runSeed: save.runSeed, floor: 5, status: 'DEAD' })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
      expect(() => validateSettleReport(save, { runSeed: save.runSeed, floor: 2, status: 'DEAD' })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
    });

    it('无存档时结算层号必须为 1', () => {
      expect(() => validateSettleReport(null, { runSeed: 1, floor: 1, status: 'DEAD' })).not.toThrow();
      expect(() => validateSettleReport(null, { runSeed: 1, floor: 2, status: 'DEAD' })).toThrow(
        expect.objectContaining({ code: 'PVE_FLOOR_DISCONTINUITY' }),
      );
    });

    it('runSeed 不一致或 status 非法时拒绝', () => {
      const save = makeSave({ runSeed: 12345, floor: 3 });
      expect(() => validateSettleReport(save, { runSeed: 1, floor: 3, status: 'DEAD' })).toThrow(
        expect.objectContaining({ code: 'PVE_SEED_MISMATCH' }),
      );
      expect(() => validateSettleReport(save, { runSeed: save.runSeed, floor: 3, status: 'WIN' })).toThrow(
        expect.objectContaining({ code: 'PVE_INVALID_STATUS' }),
      );
    });
  });
});

describe('PveReward — 结算奖励纯服务端计算（design §2.1 / AC-14）', () => {
  describe('isBossFloor / countClearedBossFloors', () => {
    it('每章第 5 层为 Boss 层', () => {
      expect(isBossFloor(5)).toBe(true);
      expect(isBossFloor(10)).toBe(true);
      expect(isBossFloor(25)).toBe(true);
      expect(isBossFloor(1)).toBe(false);
      expect(isBossFloor(4)).toBe(false);
    });

    it('已通关层数中的 Boss 层数量按整除章节层数计算', () => {
      expect(countClearedBossFloors(0)).toBe(0);
      expect(countClearedBossFloors(4)).toBe(0);
      expect(countClearedBossFloors(5)).toBe(1);
      expect(countClearedBossFloors(9)).toBe(1);
      expect(countClearedBossFloors(25)).toBe(5);
    });
  });

  describe('computeSettleReward — 死亡 vs 通关的已通关层数边界', () => {
    it('死亡时只计已通过的层数（finalFloor - 1），不计当前未完成层', () => {
      const reward = computeSettleReward(6, 'DEAD');
      expect(reward.floorsCleared).toBe(5);
      expect(reward.diamond).toBe(5 * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR + 1 * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR);
      expect(reward.destinyShards).toBe(5 * PVE_SETTLE_REWARD.SHARD_PER_FLOOR + 1 * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR);
    });

    it('在第 1 层死亡时已通关层数下界为 0，不产生负值', () => {
      const reward = computeSettleReward(1, 'DEAD');
      expect(reward.floorsCleared).toBe(0);
      expect(reward.diamond).toBe(0);
      expect(reward.destinyShards).toBe(0);
    });

    it('通关时当前层也计入已通关层数', () => {
      const reward = computeSettleReward(25, 'COMPLETED');
      expect(reward.floorsCleared).toBe(25);
      expect(reward.diamond).toBe(25 * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR + 5 * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR);
      expect(reward.destinyShards).toBe(25 * PVE_SETTLE_REWARD.SHARD_PER_FLOOR + 5 * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR);
    });

    it('奖励完全由层数纯计算得出，与上报的奖励数值无关（服务端权威 → AC-14）', () => {
      const a = computeSettleReward(11, 'DEAD');
      const b = computeSettleReward(11, 'DEAD');
      expect(a).toEqual(b);
    });
  });
});

describe('PveDestinyTree — canUnlockNode 服务端权威校验（specs/260610-destiny-tree-ui）', () => {
  function makeMeta(overrides = {}) {
    return { destinyShards: 100, unlockedTreeNodes: [], ...overrides };
  }

  it('节点不存在时返回 false', () => {
    expect(canUnlockNode(makeMeta(), 'Z9')).toBe(false);
  });

  it('已解锁的节点不可重复解锁', () => {
    const meta = makeMeta({ unlockedTreeNodes: ['A1'] });
    expect(canUnlockNode(meta, 'A1')).toBe(false);
  });

  it('碎片不足时不可解锁', () => {
    const def = getNodeDef('A1');
    const meta = makeMeta({ destinyShards: def.cost - 1 });
    expect(canUnlockNode(meta, 'A1')).toBe(false);
  });

  it('同列需按 order 顺序解锁：前置节点未解锁时 A2 不可解锁', () => {
    const meta = makeMeta({ unlockedTreeNodes: [] });
    expect(canUnlockNode(meta, 'A2')).toBe(false);
  });

  it('前置节点已解锁且碎片足够时可解锁后续节点', () => {
    const meta = makeMeta({ unlockedTreeNodes: ['A1'] });
    expect(canUnlockNode(meta, 'A2')).toBe(true);
  });

  it('首节点（order 1）碎片足够时可直接解锁，无需前置', () => {
    expect(canUnlockNode(makeMeta(), 'A1')).toBe(true);
  });
});
