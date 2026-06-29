/**
 * PVE 存档/结算的服务端校验（design ddl-sql.md §3 / AC-14）。
 * 纯函数：不读写数据库，只在已加载的 save 与客户端上报数据之间做边界判断。
 * 不通过时抛出带 code 的 Error，由调用方统一转换为 { ok:false, code, message } 响应。
 */

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * 校验"完成一层"上报：层号必须紧接当前存档推进一层（不可跳层/回退），
 * 且远征种子必须与已有存档一致（不可中途换种子伪造进度）。
 * 不存在存档时，视为新远征，层号必须从 1 开始。
 */
const MAX_FLOOR = 35;

function validateSaveFloorReport(save, report) {
  const floor = Number(report.floor);
  const runSeed = Number(report.runSeed);
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) {
    fail('PVE_INVALID_FLOOR', 'floor 不合法');
  }
  if (!Number.isInteger(runSeed)) {
    fail('PVE_INVALID_SEED', 'runSeed 不合法');
  }

  if (!save) {
    if (floor !== 1) {
      fail('PVE_FLOOR_DISCONTINUITY', '新远征必须从第 1 层开始存档');
    }
    return;
  }

  if (save.runSeed !== runSeed) {
    fail('PVE_SEED_MISMATCH', 'runSeed 与现有存档不一致');
  }
  if (floor !== save.floor + 1) {
    fail('PVE_FLOOR_DISCONTINUITY', `floor 必须紧接当前存档推进一层（当前 ${save.floor}，上报 ${floor}）`);
  }
}

/**
 * 校验"远征结算"上报：最终层号只能停留在当前存档层或恰好推进一层
 * （死亡可能发生在到达新层之后、尚未 saveFloor 之前）。
 */
function validateSettleReport(save, report) {
  const floor = Number(report.floor);
  const status = report.status;
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) {
    fail('PVE_INVALID_FLOOR', 'floor 不合法');
  }
  if (status !== 'DEAD' && status !== 'COMPLETED') {
    fail('PVE_INVALID_STATUS', 'status 必须是 DEAD 或 COMPLETED');
  }
  if (!save) {
    if (floor !== 1) {
      fail('PVE_FLOOR_DISCONTINUITY', '无存档时结算层号必须为 1');
    }
    return;
  }
  if (Number(report.runSeed) !== save.runSeed) {
    fail('PVE_SEED_MISMATCH', 'runSeed 与现有存档不一致');
  }
  if (floor < save.floor || floor > save.floor + 1) {
    fail('PVE_FLOOR_DISCONTINUITY', `结算层号超出合理范围（当前存档 ${save.floor}，上报 ${floor}）`);
  }
}

module.exports = {
  validateSaveFloorReport,
  validateSettleReport,
};
