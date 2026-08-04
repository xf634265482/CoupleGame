/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    // wx-server-sdk 只在微信云运行时提供，本地测试统一走 __mocks__ 下的 stub
    '^wx-server-sdk$': '<rootDir>/__mocks__/wx-server-sdk.js',
  },
};
