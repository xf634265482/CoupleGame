jest.mock('../db', () => ({
  listPveLeaderboard: jest.fn(),
  getUserPveMeta: jest.fn(),
  updateUserPveMeta: jest.fn(),
}));

const { listPveLeaderboard: mockList } = require('../db');
const { loadLeaderboard } = require('../pve/PveMeta');

beforeEach(() => mockList.mockReset());

test('passes user id and requested limit to the database layer', async () => {
  mockList.mockResolvedValue({ entries: [], myRank: null });
  await expect(loadLeaderboard({ id: 'u42' }, 20)).resolves.toEqual({ entries: [], myRank: null });
  expect(mockList).toHaveBeenCalledWith('u42', 20);
});

test('lets the database layer apply its default limit', async () => {
  mockList.mockResolvedValue({ entries: [], myRank: null });
  await loadLeaderboard({ id: 'u42' });
  expect(mockList).toHaveBeenCalledWith('u42', undefined);
});
