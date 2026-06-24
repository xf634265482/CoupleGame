/**
 * 排行榜 — PveMeta 层单测（AC-508）
 * mock '../db'，验证 loadLeaderboard 透传 userId/limit/myRank 的正确性。
 */

jest.mock('../db', () => ({
  listPveLeaderboard: jest.fn(),
  getUserPveMeta:     jest.fn(),
  updateUserPveMeta:  jest.fn(),
  unlockUserTreeNode: jest.fn(),
  resetUserTreeNodes: jest.fn(),
}));

const { listPveLeaderboard: mockList } = require('../db');
const { loadLeaderboard } = require('../pve/PveMeta');

const user = { id: 'u42' };

afterEach(() => jest.clearAllMocks());

describe('PveMeta.loadLeaderboard — 参数透传', () => {
  it('将 userId 和 limit 传给 db.listPveLeaderboard', async () => {
    mockList.mockResolvedValue({ entries: [], myRank: null });
    await loadLeaderboard(user, 20);
    expect(mockList).toHaveBeenCalledWith('u42', 20);
  });

  it('limit 未传时透传 undefined（由 db.js 使用默认值 50）', async () => {
    mockList.mockResolvedValue({ entries: [], myRank: null });
    await loadLeaderboard(user);
    expect(mockList).toHaveBeenCalledWith('u42', undefined);
  });
});

describe('PveMeta.loadLeaderboard — 返回值', () => {
  it('透传非空 myRank', async () => {
    mockList.mockResolvedValue({ entries: [], myRank: 7 });
    const res = await loadLeaderboard(user, 20);
    expect(res.myRank).toBe(7);
  });

  it('透传 myRank: null（未上榜）', async () => {
    mockList.mockResolvedValue({ entries: [], myRank: null });
    const res = await loadLeaderboard(user, 20);
    expect(res.myRank).toBeNull();
  });

  it('空榜时 entries 为 []', async () => {
    mockList.mockResolvedValue({ entries: [], myRank: null });
    const res = await loadLeaderboard(user, 20);
    expect(res.entries).toEqual([]);
  });

  it('透传完整 entries 数组', async () => {
    const entries = [
      { rank: 1, userId: 'a', nickname: '甲', avatarUrl: '', highestFloor: 20 },
      { rank: 2, userId: 'b', nickname: '乙', avatarUrl: '', highestFloor: 15 },
    ];
    mockList.mockResolvedValue({ entries, myRank: 3 });
    const res = await loadLeaderboard(user, 20);
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0].rank).toBe(1);
    expect(res.entries[1].highestFloor).toBe(15);
  });
});
