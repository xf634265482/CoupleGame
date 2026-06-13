/**
 * PVE「命运远征」存档读写编排（design ddl-sql.md §1 / AC-11, AC-14）。
 * 对应 pve 云函数 action：loadSave / saveFloor / settleRun。
 * 所有写操作经此模块完成边界校验（PveValidate）与奖励计算（PveReward），
 * 客户端对 pve_saves 与 users 的 PVE 字段只读。
 */

const {
  getPveSaveByUserId,
  putPveSave,
  deletePveSave,
  incrementUserPveRewards,
} = require('../db');
const { validateSaveFloorReport, validateSettleReport } = require('./PveValidate');
const { computeSettleReward } = require('./PveReward');

function toSaveVO(save) {
  if (!save) return null;
  return {
    runSeed: save.runSeed,
    status: save.status,
    chapter: save.chapter,
    floor: save.floor,
    player: save.player,
    floorState: save.floorState || null,
    updatedAt: save.updatedAt,
  };
}

/** 读取用户当前活跃远征存档（无存档返回 null，客户端据此开启新远征 → AC-11）。 */
async function loadActiveSave(user) {
  const save = await getPveSaveByUserId(user.id);
  return { save: toSaveVO(save) };
}

/**
 * 开始一次远征（→ AC-503/504）：runSeed 由服务端生成，客户端不可重试以套取有利地图。
 * 已有活跃存档时返回其 runSeed（resume:true），确保与后续 saveFloor 上报种子一致。
 */
async function startRun(user) {
  const current = await getPveSaveByUserId(user.id);
  if (current) {
    return { runSeed: current.runSeed, resume: true };
  }
  const runSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  return { runSeed, resume: false };
}

/**
 * 完成一层后自动存档（→ AC-11）：校验层号紧接推进、种子未变后整份覆盖写入。
 * 上报字段均为 ExpeditionState 可序列化字段（runSeed/chapter/floor/player/floorState）。
 */
async function saveFloorProgress(user, report = {}) {
  const current = await getPveSaveByUserId(user.id);
  validateSaveFloorReport(current, report);

  const patch = {
    openId: user._openid,
    runSeed: Number(report.runSeed),
    status: 'ACTIVE',
    chapter: Number(report.chapter),
    floor: Number(report.floor),
    player: report.player || null,
    floorState: report.floorState || null,
  };

  const saved = await putPveSave(user.id, patch, current ? current.version : undefined);
  return { save: toSaveVO(saved) };
}

/**
 * 远征结算（死亡或通关，→ AC-12, AC-14）：
 * 校验最终层号合理后，由服务端纯计算奖励（不信任客户端上报数值）入账，
 * 并清除活跃存档——下次进入视为开启新远征。
 */
async function settleExpedition(user, report = {}) {
  const current = await getPveSaveByUserId(user.id);
  validateSettleReport(current, report);

  const finalFloor = Number(report.floor);
  const status = report.status;
  const rewards = computeSettleReward(finalFloor, status);

  await incrementUserPveRewards(user.id, {
    diamond: rewards.diamond,
    destinyShards: rewards.destinyShards,
  });

  if (current) {
    await deletePveSave(current._id);
  }

  return { rewards };
}

module.exports = {
  loadActiveSave,
  startRun,
  saveFloorProgress,
  settleExpedition,
};
