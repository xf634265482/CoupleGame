/** 本地 smoke test：node cloudfunctions/common/smoke-test.js */
const { generateId, generateRoomCode } = require('./id');
const constants = require('./constants');

const id1 = generateId();
const id2 = generateId();
const code = generateRoomCode();

if (id1 === id2) {
  console.error('FAIL: duplicate ids');
  process.exit(1);
}
if (!/^\d{6}$/.test(code)) {
  console.error('FAIL: invalid room code', code);
  process.exit(1);
}
if (constants.BOARD_SIZE !== 58) {
  console.error('FAIL: constants mismatch');
  process.exit(1);
}

console.log('OK', { id1, id2, code, BOARD_SIZE: constants.BOARD_SIZE });
