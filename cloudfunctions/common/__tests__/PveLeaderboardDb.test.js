const wx = require('../__mocks__/wx-server-sdk');
const { _chain: chain } = wx;
const { listPveLeaderboard } = require('../db');

function resetChain() {
  [chain.where, chain.orderBy, chain.limit, chain.doc].forEach((fn) => {
    fn.mockReset();
    fn.mockReturnValue(chain);
  });
  chain.get.mockReset().mockResolvedValue({ data: [] });
}

beforeEach(resetChain);

test('queries the nested profile authority', async () => {
  await listPveLeaderboard('u1', 20);
  expect(chain.where).toHaveBeenCalledWith(
    expect.objectContaining({ 'pveProfile.highestClearedFloor': expect.anything() }),
  );
  expect(chain.orderBy).toHaveBeenCalledWith('pveProfile.highestClearedFloor', 'desc');
  expect(chain.limit).toHaveBeenCalledWith(200);
});

test('orders by floor then earliest first-clear time and returns only current fields', async () => {
  chain.get.mockResolvedValue({
    data: [
      { id: 'floor7Late', nickname: '后到', pveProfile: { highestClearedFloor: 7, highestClearedAt: 2000 } },
      { id: 'floor8', nickname: '八层', pveProfile: { highestClearedFloor: 8, highestClearedAt: 3000 } },
      { id: 'floor7Early', nickname: '先到', pveProfile: { highestClearedFloor: 7, highestClearedAt: 1000 } },
    ],
  });

  const { entries, myRank } = await listPveLeaderboard('floor7Early', 20);
  expect(entries.map((entry) => entry.userId)).toEqual(['floor8', 'floor7Early', 'floor7Late']);
  expect(myRank).toBe(2);
  expect(entries[0]).toEqual({
    rank: 1,
    userId: 'floor8',
    nickname: '八层',
    avatarUrl: '',
    highestFloor: 8,
  });
  expect(entries[0]).not.toHaveProperty('highestTier');
  expect(entries[0]).not.toHaveProperty('highestClassId');
  expect(entries[0]).not.toHaveProperty('highestAwakenForm');
});

test('clamps response limit to 100', async () => {
  chain.get.mockResolvedValue({
    data: Array.from({ length: 150 }, (_, index) => ({
      id: `u${index}`,
      pveProfile: { highestClearedFloor: 150 - index, highestClearedAt: index },
    })),
  });
  const { entries } = await listPveLeaderboard('', 999);
  expect(entries).toHaveLength(100);
});
