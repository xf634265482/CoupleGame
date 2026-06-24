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
