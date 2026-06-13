jest.mock('../db', () => ({
  getPveSaveByUserId: jest.fn(),
}));

const { getPveSaveByUserId } = require('../db');
const { startRun } = require('../pve/PveSave');

describe('PveSave.startRun — 服务端权威 runSeed（AC-503/504）', () => {
  const user = { id: 'u1' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('无活跃存档时生成新的 runSeed（resume:false）', async () => {
    getPveSaveByUserId.mockResolvedValue(null);

    const { runSeed, resume } = await startRun(user);

    expect(resume).toBe(false);
    expect(Number.isInteger(runSeed)).toBe(true);
    expect(runSeed).toBeGreaterThan(0);
    expect(runSeed).toBeLessThanOrEqual(0x7fffffff);
  });

  it('已有活跃存档时返回其 runSeed（resume:true），与已存档一致 → 续局', async () => {
    getPveSaveByUserId.mockResolvedValue({ runSeed: 12345 });

    const { runSeed, resume } = await startRun(user);

    expect(resume).toBe(true);
    expect(runSeed).toBe(12345);
  });
});
