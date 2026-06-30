/**
 * PVE 结算奖励（钻石/命运碎片）的服务端计算（design ddl-sql.md §3 / AC-14）。
 * 奖励完全由服务端按"已通关层数"纯计算得出，不读取/信任客户端上报的奖励数值，
 * 从根源杜绝越界上报（design §2.1：钻石账户共享，命运碎片为 PVE 专属局外资产）。
 */

const { PVE_FLOORS_PER_CHAPTER, PVE_SETTLE_REWARD, PVE_DIFFICULTY, PVE_DIFFICULTY_MULTIPLIERS, PVE_TOTAL_FLOORS } = require('../constants');

/** 第 floor 层（1-based）是否为章节 Boss 层。须与 PveConstants.isBossFloor 一致（→ AC-13）。 */
function isBossFloor(floor) {
  return floor % PVE_FLOORS_PER_CHAPTER === 0;
}

/** 已通关层数中包含的 Boss 层数量。 */
function countClearedBossFloors(floorsCleared) {
  return Math.floor(floorsCleared / PVE_FLOORS_PER_CHAPTER);
}

/**
 * 按"已通关层数"计算结算奖励上界（同时也是发放值——服务端权威，无需另设上限校验）。
 * 命运碎片按难度档倍率放大（→ AC-P3-9；钻石和局内资源不受难度影响）。
 * 通关全35层（status=COMPLETED）时追加碎片大礼包；首通该难度档时另有一次性奖励。
 * @param {number} finalFloor 远征结束时所在层号（1-based）
 * @param {'DEAD'|'COMPLETED'} status
 * @param {string} [tier] 难度档（缺省 NORMAL，→ AC-P3-10 老账号兼容）
 * @param {boolean} [isFirstClear] 是否首通该难度档（由调用方根据用户记录判断）
 * @returns {{ floorsCleared: number; diamond: number; destinyShards: number; completionBonus: boolean; firstClearBonus: boolean }}
 */
function computeSettleReward(finalFloor, status, tier = PVE_DIFFICULTY.NORMAL, isFirstClear = false) {
  // 通关时当前层也已清理；死亡时当前层未完成，只计已通过的层数。
  const floorsCleared = status === 'COMPLETED' ? finalFloor : Math.max(0, finalFloor - 1);
  const bossFloors = countClearedBossFloors(floorsCleared);

  let diamond =
    floorsCleared * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR +
    bossFloors * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR;
  let baseShard =
    floorsCleared * PVE_SETTLE_REWARD.SHARD_PER_FLOOR +
    bossFloors * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR;

  // 通关全35层：碎片大礼包 + 额外钻石（Phase 6 AC-EQ-10）
  const completionBonus = status === 'COMPLETED' && finalFloor >= PVE_TOTAL_FLOORS;
  if (completionBonus) {
    baseShard += PVE_SETTLE_REWARD.COMPLETION_BONUS_SHARD;
    diamond   += PVE_SETTLE_REWARD.COMPLETION_BONUS_DIAMOND;
  }

  // 难度碎片倍率（普通=1.0，困难=1.15，噩梦=1.30，深渊=1.50，绝境=1.75）
  const mult = (PVE_DIFFICULTY_MULTIPLIERS[tier] ?? PVE_DIFFICULTY_MULTIPLIERS[PVE_DIFFICULTY.NORMAL]).shardMult;
  let destinyShards = Math.round(baseShard * mult);

  // 首通该难度档：一次性额外奖励（不受 shardMult 叠加，已独立体现难度价值）
  const firstClearShardBonus = PVE_SETTLE_REWARD.FIRST_CLEAR_SHARD_BONUS;
  const firstClearDiamondBonus = PVE_SETTLE_REWARD.FIRST_CLEAR_DIAMOND_BONUS;
  if (isFirstClear && completionBonus) {
    destinyShards += firstClearShardBonus[tier] ?? firstClearShardBonus[PVE_DIFFICULTY.NORMAL];
    diamond       += firstClearDiamondBonus[tier] ?? firstClearDiamondBonus[PVE_DIFFICULTY.NORMAL];
  }

  return { floorsCleared, diamond, destinyShards, completionBonus, firstClearBonus: isFirstClear && completionBonus };
}

module.exports = {
  isBossFloor,
  countClearedBossFloors,
  computeSettleReward,
};
