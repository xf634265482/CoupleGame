/**
 * PVE 结算奖励（钻石/命运碎片）的服务端计算（design ddl-sql.md §3 / AC-14）。
 * 奖励完全由服务端按"已通关层数"纯计算得出，不读取/信任客户端上报的奖励数值，
 * 从根源杜绝越界上报（design §2.1：钻石账户共享，命运碎片为 PVE 专属局外资产）。
 */

const { PVE_FLOORS_PER_CHAPTER, PVE_SETTLE_REWARD } = require('../constants');

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
 * @param {number} finalFloor 远征结束时所在层号（1-based）
 * @param {'DEAD'|'COMPLETED'} status
 * @returns {{ floorsCleared: number; diamond: number; destinyShards: number }}
 */
function computeSettleReward(finalFloor, status) {
  // 通关时当前层也已清理；死亡时当前层未完成，只计已通过的层数。
  const floorsCleared = status === 'COMPLETED' ? finalFloor : Math.max(0, finalFloor - 1);
  const bossFloors = countClearedBossFloors(floorsCleared);

  const diamond =
    floorsCleared * PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR +
    bossFloors * PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR;
  const destinyShards =
    floorsCleared * PVE_SETTLE_REWARD.SHARD_PER_FLOOR +
    bossFloors * PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR;

  return { floorsCleared, diamond, destinyShards };
}

module.exports = {
  isBossFloor,
  countClearedBossFloors,
  computeSettleReward,
};
