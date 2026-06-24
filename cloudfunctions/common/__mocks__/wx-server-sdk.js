/**
 * wx-server-sdk stub（仅供本地 jest 使用）。
 * 暴露一个可配置的链式查询对象，供测试通过 mockResolvedValue / mockResolvedValueOnce 定制返回值。
 */

const chain = {
  where:   jest.fn(() => chain),
  orderBy: jest.fn(() => chain),
  limit:   jest.fn(() => chain),
  doc:     jest.fn(() => chain),
  get:     jest.fn().mockResolvedValue({ data: [] }),
  count:   jest.fn().mockResolvedValue({ total: 0 }),
  update:  jest.fn().mockResolvedValue({}),
  remove:  jest.fn().mockResolvedValue({}),
};

const mockDb = {
  collection:    jest.fn(() => chain),
  command: {
    gt:     (v) => ({ $gt: v }),
    inc:    (v) => ({ $inc: v }),
    remove: ()  => ({ $remove: true }),
    set:    (v) => ({ $set: v }),
  },
  serverDate: () => 'SERVER_DATE',
  runTransaction: async (fn) => fn({ collection: jest.fn(() => chain) }),
};

module.exports = {
  database:            jest.fn(() => mockDb),
  init:                jest.fn(),
  getWXContext:        jest.fn(() => ({ OPENID: 'test-openid' })),
  DYNAMIC_CURRENT_ENV: 'test-env',
  // helpers exposed for tests
  _chain:  chain,
  _mockDb: mockDb,
};
