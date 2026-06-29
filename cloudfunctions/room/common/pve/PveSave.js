/**
 * PVE「命运远征」存档读写编排（design ddl-sql.md §1 / AC-11, AC-14）。
 * 对应 pve 云函数 action：loadSave / saveFloor / settleRun。
 * 所有写操作经此模块完成边界校验（PveValidate）与奖励计算（PveReward），
 * 客户端对 pve_saves 与 users 的 PVE 字段只读。
 */

const { PVE_DIFFICULTY, PVE_DIFFICULTY_ORDER, PVE_TOTAL_FLOORS } = require('../constants');
const {
  getPveSaveByUserId,
  putPveSave,
  deletePveSave,
  incrementUserPveRewards,
  reservePveRunStart,
  clearPendingPveRun,
} = require('../db');
const { validateSaveFloorReport, validateSettleReport } = require('./PveValidate');
const { computeSettleReward } = require('./PveReward');

/**
 * 根据用户已通关难度列表自动推导当前应挑战的难度档：
 * 取 DIFFICULTY_ORDER 中第一个尚未通关的档位；若已全通则保持最高档（INFERNO）。
 * 难度由服务端权威计算，客户端不可指定（→ AC-P3-6）。
 */
function resolveCurrentTier(pveClearedTiers = []) {
  return PVE_DIFFICULTY_ORDER.find((t) => !pveClearedTiers.includes(t))
    ?? PVE_DIFFICULTY_ORDER[PVE_DIFFICULTY_ORDER.length - 1];
}

function toSaveVO(save) {
  if (!save) return null;
  return {
    runSeed: save.runSeed,
    status: save.status,
    chapter: save.chapter,
    floor: save.floor,
    player: save.player,
    floorState: save.floorState || null,
    balanceSnapshot: save.balanceSnapshot || null,
    difficultyTier: save.difficultyTier || PVE_DIFFICULTY.NORMAL,
    updatedAt: save.updatedAt,
  };
}

/** 读取用户当前活跃远征存档（无存档返回 null，客户端据此开启新远征 → AC-11）。 */
async function loadActiveSave(user) {
  const save = await getPveSaveByUserId(user.id);
  return { save: toSaveVO(save) };
}

/**
 * 开始一次远征（→ AC-503/504, AC-P3-6）：runSeed 由服务端生成，客户端不可重试以套取有利地图。
 * 已有活跃存档时返回其 runSeed（resume:true），确保与后续 saveFloor 上报种子一致。
 * 难度档由服务端根据通关记录自动推导（→ AC-P3-6），客户端不可指定。
 * @param {object} user - 已通过身份校验的用户对象（包含 pveClearedTiers 字段）
 */
async function startRun(user) {
  const current = await getPveSaveByUserId(user.id);
  if (current) {
    // 续档：难度档以存档内记录为准（→ AC-P3-9）
    return {
      runSeed: current.runSeed,
      resume: true,
      charged: 0,
      difficultyTier: current.difficultyTier || PVE_DIFFICULTY.NORMAL,
    };
  }
  // 新局：服务端自动推导当前难度档（通关普通→困难→噩梦→...）
  const tier = resolveCurrentTier(user.pveClearedTiers ?? []);

  const runSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  const reserved = await reservePveRunStart(user, runSeed);
  return {
    runSeed: reserved.runSeed,
    resume: false,
    charged: reserved.charged,
    stamina: reserved.stamina.stamina,
    staminaNextRecoveryAt: reserved.stamina.nextRecoveryAt,
    difficultyTier: tier,
  };
}

/**
 * 完成一层后自动存档（→ AC-11）：校验层号紧接推进、种子未变后整份覆盖写入。
 * 上报字段均为 ExpeditionState 可序列化字段（runSeed/chapter/floor/player/floorState）。
 */
async function saveFloorProgress(user, report = {}) {
  const current = await getPveSaveByUserId(user.id);
  validateSaveFloorReport(current, report);

  // 难度档以存档记录为准（若新存档则取 report.difficultyTier，缺省 NORMAL → AC-P3-9）
  const difficultyTier = current?.difficultyTier || report.difficultyTier || PVE_DIFFICULTY.NORMAL;
  const patch = {
    openId: user._openid,
    runSeed: Number(report.runSeed),
    status: 'ACTIVE',
    chapter: Number(report.chapter),
    floor: Number(report.floor),
    player: report.player || null,
    floorState: report.floorState || null,
    balanceSnapshot: report.balanceSnapshot || null,
    difficultyTier,
  };

  const saved = await putPveSave(user.id, patch, current ? current.version : undefined);
  await clearPendingPveRun(user.id);

  // 中途存档也同步"已通关最高层"，用于排行榜与大厅"最高 X 层"显示。
  // 玩家当前所在层为 floor，则已通关层数 = floor - 1（floor=1 时为 0，不入榜）。
  const clearedFloor = Math.max(0, Math.trunc(patch.floor) - 1);
  if (clearedFloor > 0) {
    await incrementUserPveRewards(user.id, { highestFloor: clearedFloor });
  }

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
  // 难度档：以存档记录为权威（→ AC-P3-9，防止客户端伪造高难度）
  const tier = current?.difficultyTier || report.difficultyTier || PVE_DIFFICULTY.NORMAL;
  const rewards = computeSettleReward(finalFloor, status, tier);

  // 通关第 35 层 → 记录该档通关，供下一档解锁校验（→ AC-P3-6）
  const isClearRecord = status === 'COMPLETED' && finalFloor === PVE_TOTAL_FLOORS;

  await incrementUserPveRewards(user.id, {
    diamond: rewards.diamond,
    destinyShards: rewards.destinyShards,
    highestFloor: finalFloor,
    tier,
    isClearRecord,
  });

  if (current) {
    await deletePveSave(current._id);
  }
  await clearPendingPveRun(user.id);

  return { rewards };
}

module.exports = {
  loadActiveSave,
  startRun,
  saveFloorProgress,
  settleExpedition,
};
