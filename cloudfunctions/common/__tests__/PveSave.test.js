jest.mock('../db', () => ({
  getPveSaveByUserId: jest.fn(),
  reservePveRunStart: jest.fn(),
  clearPendingPveRun: jest.fn(),
}));

const { getPveSaveByUserId, reservePveRunStart } = require('../db');
const { startRun } = require('../pve/PveSave');

describe('PveSave.startRun — 服务端权威种子与体力', () => {
  const user = { id: 'u1', _id: 'doc-u1' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('无活跃存档时预留种子并扣除体力', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockImplementation(async (_user, seed) => ({
      runSeed: seed,
      charged: 20,
      stamina: { stamina: 40, nextRecoveryAt: 123 },
    }));

    const result = await startRun(user);

    expect(result.resume).toBe(false);
    expect(result.charged).toBe(20);
    expect(result.stamina).toBe(40);
    expect(Number.isInteger(result.runSeed)).toBe(true);
    expect(result.runSeed).toBeGreaterThan(0);
  });

  it('已有活跃存档时继续原种子且不扣体力', async () => {
    getPveSaveByUserId.mockResolvedValue({ runSeed: 12345 });

    const result = await startRun(user);

    expect(result.resume).toBe(true);
    expect(result.runSeed).toBe(12345);
    expect(result.charged).toBe(0);
    expect(reservePveRunStart).not.toHaveBeenCalled();
  });
});

// ── 难度自动推导（resolveCurrentTier，→ AC-P3-6）──────────────────────────

describe('PveSave.startRun — 难度档自动推导', () => {
  function makeReserve(seed = 1) {
    return { runSeed: seed, charged: 0, stamina: { stamina: 60, nextRecoveryAt: 0 } };
  }

  afterEach(() => jest.clearAllMocks());

  it('新用户（pveClearedTiers 为空）→ NORMAL', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockResolvedValue(makeReserve());

    const result = await startRun({ id: 'u1', pveClearedTiers: [] });
    expect(result.difficultyTier).toBe('NORMAL');
  });

  it('通关 NORMAL 后 → HARD', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockResolvedValue(makeReserve());

    const result = await startRun({ id: 'u1', pveClearedTiers: ['NORMAL'] });
    expect(result.difficultyTier).toBe('HARD');
  });

  it('通关到 NIGHTMARE → ABYSS', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockResolvedValue(makeReserve());

    const result = await startRun({ id: 'u1', pveClearedTiers: ['NORMAL', 'HARD', 'NIGHTMARE'] });
    expect(result.difficultyTier).toBe('ABYSS');
  });

  it('全部通关 → 保持 INFERNO（最高档）', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockResolvedValue(makeReserve());

    const result = await startRun({
      id: 'u1',
      pveClearedTiers: ['NORMAL', 'HARD', 'NIGHTMARE', 'ABYSS', 'INFERNO'],
    });
    expect(result.difficultyTier).toBe('INFERNO');
  });

  it('pveClearedTiers 字段缺失时降级为 NORMAL（老账号兼容 → AC-P3-10）', async () => {
    getPveSaveByUserId.mockResolvedValue(null);
    reservePveRunStart.mockResolvedValue(makeReserve());

    const result = await startRun({ id: 'u1' }); // 无 pveClearedTiers
    expect(result.difficultyTier).toBe('NORMAL');
  });

  it('续档时以存档内 difficultyTier 为准，不受 pveClearedTiers 影响', async () => {
    getPveSaveByUserId.mockResolvedValue({ runSeed: 999, difficultyTier: 'NIGHTMARE' });

    const result = await startRun({ id: 'u1', pveClearedTiers: ['NORMAL', 'HARD'] });
    expect(result.difficultyTier).toBe('NIGHTMARE');
    expect(result.resume).toBe(true);
  });
});
