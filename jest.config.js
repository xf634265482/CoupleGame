// PVE 客户端核心逻辑单测（ts-jest）。
// 测试放在 repo 根 test/ 下（不在 assets/ 内），避免被 Cocos Creator 编译进游戏包。
// 仅编译 test/** 与零框架依赖的 assets/scripts/pve/core/**。
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^cc/env$': '<rootDir>/test/__mocks__/cc-env.ts',
    '^cc$': '<rootDir>/test/__mocks__/cc.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', diagnostics: false }],
  },
};
