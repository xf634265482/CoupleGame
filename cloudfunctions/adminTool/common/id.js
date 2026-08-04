/**
 * 应用层雪花 ID（禁止数据库自增，见 PD13）
 * 返回 string，便于云数据库 _id / id 字段
 */

const WORKER_ID = 1n;
const EPOCH = 1704067200000n; // 2024-01-01 UTC

let lastTs = 0n;
let sequence = 0n;

function generateId() {
  let ts = BigInt(Date.now()) - EPOCH;

  if (ts === lastTs) {
    sequence = (sequence + 1n) & 0xfffn;
    if (sequence === 0n) {
      // 同毫秒内序列溢出，等到下一毫秒
      while (ts <= lastTs) {
        ts = BigInt(Date.now()) - EPOCH;
      }
    }
  } else {
    sequence = 0n;
  }

  lastTs = ts;
  const id = (ts << 22n) | (WORKER_ID << 12n) | sequence;
  return id.toString();
}

/** 6 位数字房间号 */
function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = {
  generateId,
  generateRoomCode,
};
