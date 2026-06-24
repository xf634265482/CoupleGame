/**
 * 排行榜 — db.js 层单测（AC-508）
 * wx-server-sdk 由 jest.config.js moduleNameMapper 指向 __mocks__/wx-server-sdk.js。
 */

const wx = require('../__mocks__/wx-server-sdk');
const { _chain: c } = wx;

const { listPveLeaderboard, incrementUserPveRewards } = require('../db');

/**
 * 手动重置 chain 各方法：清历史 + 重建链式返回值 + 设置安全默认值。
 * 不使用 jest.resetAllMocks()，因为那会把 wx.database 也清掉。
 */
function resetChain() {
  [c.where, c.orderBy, c.limit, c.doc].forEach((fn) => {
    fn.mockReset();
    fn.mockReturnValue(c); // 恢复链式调用
  });
  c.get.mockReset().mockResolvedValue({ data: [] });
  c.count.mockReset().mockResolvedValue({ total: 0 });
  c.update.mockReset().mockResolvedValue({});
  c.remove.mockReset().mockResolvedValue({});
}

beforeEach(resetChain);

// ── listPveLeaderboard：limit 边界（AC-508 最多 100 条） ──────────────────

describe('db.listPveLeaderboard — limit 边界', () => {
  // 让 getUserById 返回 0 层用户，使 myRank 分支正常退出
  beforeEach(() => {
    c.get.mockResolvedValue({ data: [{ id: 'u1', pveHighestFloor: 0 }] });
  });

  it('未传 limit 时默认为 50', async () => {
    await listPveLeaderboard('u1');
    expect(c.limit).toHaveBeenCalledWith(50);
  });

  it('limit 传 20 时使用 20', async () => {
    await listPveLeaderboard('u1', 20);
    expect(c.limit).toHaveBeenCalledWith(20);
  });

  it('limit 超过 100 时截断为 100', async () => {
    await listPveLeaderboard('u1', 999);
    expect(c.limit).toHaveBeenCalledWith(100);
  });

  it('limit 为 0 时最小为 1', async () => {
    await listPveLeaderboard('u1', 0);
    expect(c.limit).toHaveBeenCalledWith(1);
  });

  it('limit 为小数时向下取整', async () => {
    await listPveLeaderboard('u1', 9.9);
    expect(c.limit).toHaveBeenCalledWith(9);
  });
});

// ── listPveLeaderboard：排序与过滤 ────────────────────────────────────────

describe('db.listPveLeaderboard — 排序与过滤', () => {
  it('主排序：pveHighestFloor 降序', async () => {
    await listPveLeaderboard('u1', 20);
    expect(c.orderBy).toHaveBeenCalledWith('pveHighestFloor', 'desc');
  });

  it('第二排序：pveHighestFloorUpdatedAt 升序（先到先得，稳定排名）', async () => {
    await listPveLeaderboard('u1', 20);
    const calls = c.orderBy.mock.calls;
    expect(calls.some(([f, d]) => f === 'pveHighestFloorUpdatedAt' && d === 'asc')).toBe(true);
  });

  it('仅返回 pveHighestFloor > 0 的玩家', async () => {
    await listPveLeaderboard('u1', 20);
    expect(c.where).toHaveBeenCalledWith(
      expect.objectContaining({ pveHighestFloor: expect.anything() }),
    );
  });
});

// ── listPveLeaderboard：myRank 计算 ──────────────────────────────────────

describe('db.listPveLeaderboard — myRank 计算', () => {
  it('用户 pveHighestFloor 为 0 时 myRank 为 null（未上榜）', async () => {
    c.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 0 }] });

    const { myRank } = await listPveLeaderboard('u1', 20);
    expect(myRank).toBeNull();
  });

  it('myRank = 比自己层数高的人数 + 1', async () => {
    c.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 10 }] });
    c.count.mockResolvedValue({ total: 4 });

    const { myRank } = await listPveLeaderboard('u1', 20);
    expect(myRank).toBe(5);
  });

  it('位居第一时 myRank 为 1', async () => {
    c.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 99 }] });
    c.count.mockResolvedValue({ total: 0 });

    const { myRank } = await listPveLeaderboard('u1', 20);
    expect(myRank).toBe(1);
  });
});

// ── listPveLeaderboard：返回值与缺失字段 ──────────────────────────────────

describe('db.listPveLeaderboard — 返回值与缺失字段', () => {
  it('空榜时 entries 为 []', async () => {
    c.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 0 }] });

    const { entries } = await listPveLeaderboard('u1', 20);
    expect(entries).toEqual([]);
  });

  it('nickname 为空字符串时降级为 "玩家"', async () => {
    c.get
      .mockResolvedValueOnce({ data: [{ id: 'u2', pveHighestFloor: 5, nickname: '' }] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 0 }] });

    const { entries } = await listPveLeaderboard('u1', 20);
    expect(entries[0].nickname).toBe('玩家');
  });

  it('avatarUrl 缺失时降级为空字符串', async () => {
    c.get
      .mockResolvedValueOnce({ data: [{ id: 'u2', pveHighestFloor: 5, nickname: 'A' }] })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 0 }] });

    const { entries } = await listPveLeaderboard('u1', 20);
    expect(entries[0].avatarUrl).toBe('');
  });

  it('rank 字段从 1 开始并按顺序递增', async () => {
    c.get
      .mockResolvedValueOnce({
        data: [
          { id: 'a', pveHighestFloor: 20 },
          { id: 'b', pveHighestFloor: 15 },
          { id: 'c', pveHighestFloor: 10 },
        ],
      })
      .mockResolvedValueOnce({ data: [{ id: 'u1', pveHighestFloor: 0 }] });

    const { entries } = await listPveLeaderboard('u1', 20);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
});

// ── incrementUserPveRewards：仅在新高分时更新 ─────────────────────────────

describe('db.incrementUserPveRewards — 结算仅在新纪录更高时写入', () => {
  it('新层数高于历史最高时，写入 pveHighestFloor 与 pveHighestFloorUpdatedAt', async () => {
    c.get.mockResolvedValue({ data: [{ _id: 'doc1', id: 'u1', pveHighestFloor: 5 }] });

    await incrementUserPveRewards('u1', { highestFloor: 10 });

    const d = c.update.mock.calls[0][0].data;
    expect(d.pveHighestFloor).toBe(10);
    expect(d.pveHighestFloorUpdatedAt).toBeDefined();
  });

  it('新层数 ≤ 历史最高时，不写入 pveHighestFloor 和 pveHighestFloorUpdatedAt', async () => {
    c.get.mockResolvedValue({ data: [{ _id: 'doc1', id: 'u1', pveHighestFloor: 15 }] });

    await incrementUserPveRewards('u1', { highestFloor: 10 });

    const d = c.update.mock.calls[0][0].data;
    expect(d.pveHighestFloor).toBeUndefined();
    expect(d.pveHighestFloorUpdatedAt).toBeUndefined();
  });

  it('历史最高字段不存在（新用户）时视为 0，第 1 层触发写入', async () => {
    c.get.mockResolvedValue({ data: [{ _id: 'doc1', id: 'u1' }] });

    await incrementUserPveRewards('u1', { highestFloor: 1 });

    const d = c.update.mock.calls[0][0].data;
    expect(d.pveHighestFloor).toBe(1);
    expect(d.pveHighestFloorUpdatedAt).toBeDefined();
  });

  it('highestFloor 为 0 时不触发写入（第 1 层死亡无进度场景）', async () => {
    c.get.mockResolvedValue({ data: [{ _id: 'doc1', id: 'u1', pveHighestFloor: 0 }] });

    await incrementUserPveRewards('u1', { highestFloor: 0 });

    const d = c.update.mock.calls[0][0].data;
    expect(d.pveHighestFloor).toBeUndefined();
  });
});
