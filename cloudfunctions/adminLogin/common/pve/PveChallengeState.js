const { generateId } = require('../id');
const { calculateRewards, applyMastery, unlockProfessions } = require('./PveRewardV2');
const { settleMinghen } = require('./PveMinghen');

function stableLoadoutEntries(entries) {
  return [...entries].sort((a, b) => a.id.localeCompare(b.id));
}

function stableEquipment(loadout) {
  return Object.fromEntries(Object.entries(loadout).sort(([a], [b]) => a.localeCompare(b)));
}

function buildChallenge(userId, request, now = Date.now(), challengeId = generateId(), seed = null) {
  const challengeSeed = Number.isInteger(seed)
    ? seed
    : Number(BigInt(challengeId) & 0x7fffffffn);
  return {
    challengeId,
    userId,
    floor: request.floor,
    mode: request.mode,
    seed: challengeSeed,
    status: 'ACTIVE',
    config: {
      professionId: request.professionId,
      equipmentLoadout: stableEquipment(request.equipmentLoadout),
      minghenLoadout: stableLoadoutEntries(request.minghenLoadout),
      trackedMinghenId: request.trackedMinghenId,
    },
    startedAt: now,
    updatedAt: now,
  };
}

function requestMatchesChallenge(request, challenge) {
  if (!challenge || challenge.status !== 'ACTIVE') return false;
  return request.floor === challenge.floor
    && request.mode === challenge.mode
    && request.professionId === challenge.config.professionId
    && request.trackedMinghenId === challenge.config.trackedMinghenId
    && JSON.stringify(stableEquipment(request.equipmentLoadout))
      === JSON.stringify(stableEquipment(challenge.config.equipmentLoadout))
    && JSON.stringify(stableLoadoutEntries(request.minghenLoadout))
      === JSON.stringify(stableLoadoutEntries(challenge.config.minghenLoadout));
}

function validateLoadoutOwnership(profile, request) {
  const inventoryIds = new Set(profile.equipmentInventory.map((item) => item.instanceId));
  const equippedIds = Object.values(request.equipmentLoadout);
  if (new Set(equippedIds).size !== equippedIds.length) {
    const err = new Error('同一装备实例不能占用多个槽位');
    err.code = 'PVE_DUPLICATE_EQUIPMENT_INSTANCE';
    throw err;
  }
  for (const instanceId of equippedIds) {
    if (!inventoryIds.has(instanceId)) {
      const err = new Error(`未持有装备实例: ${instanceId}`);
      err.code = 'PVE_EQUIPMENT_NOT_OWNED';
      throw err;
    }
  }

  for (const entry of request.minghenLoadout) {
    const owned = profile.minghenCollection[entry.id];
    if (!owned || owned.level < entry.level) {
      const err = new Error(`未持有对应等级命痕: ${entry.id}`);
      err.code = 'PVE_MINGHEN_NOT_OWNED';
      throw err;
    }
    if (entry.level === 3 && owned.trialCompleted !== true) {
      const err = new Error(`三级命痕尚未完成升格试炼: ${entry.id}`);
      err.code = 'PVE_MINGHEN_TRIAL_REQUIRED';
      throw err;
    }
  }
}

function applyChallengeStart(profile, challenge, now = Date.now()) {
  return {
    ...profile,
    selectedProfessionId: challenge.config.professionId,
    activeChallengeId: challenge.challengeId,
    updatedAt: now,
  };
}

function applyChallengeSettlement(profile, challenge, result, now = Date.now()) {
  const settledChallenge = {
    ...challenge,
    status: result.status,
    result: {
      status: result.status,
      ...(result.clearTurns === undefined ? {} : { clearTurns: result.clearTurns }),
      completedOptionalObjectiveIds: result.completedOptionalObjectiveIds,
      professionHighlightCount: result.professionHighlightCount,
      selectedMinghenId: result.selectedMinghenId,
      selectedEquipmentDefinitionId: result.selectedEquipmentDefinitionId,
      huntBonusAchieved: result.huntBonusAchieved,
      trialCompleted: result.trialCompleted,
      trialEvidence: result.trialEvidence,
    },
    rewards: {},
    updatedAt: now,
  };

  let nextProfile = {
    ...profile,
    activeChallengeId: profile.activeChallengeId === challenge.challengeId
      ? null
      : profile.activeChallengeId,
    updatedAt: now,
  };

  if (result.status !== 'CLEAR') {
    return { challenge: settledChallenge, profile: nextProfile, rewards: {} };
  }

  const key = String(challenge.floor);
  const previous = profile.floorRecords[key] ?? {
    clearCount: 0,
    completedOptionalObjectiveIds: [],
    graduatedMinghenIds: [],
  };
  const rewards = calculateRewards(profile, challenge, result, previous);
  const minghen = settleMinghen(profile, challenge, result, previous);
  if (rewards.equipment && profile.equipmentInventory.length >= 60) {
    const err = new Error('装备背包已满，请先出售装备');
    err.code = 'PVE_EQUIPMENT_INVENTORY_FULL';
    throw err;
  }
  const firstClearedAt = previous.firstClearedAt ?? now;
  const bestClearTurns = result.clearTurns === undefined
    ? previous.bestClearTurns
    : previous.bestClearTurns === undefined
      ? result.clearTurns
      : Math.min(previous.bestClearTurns, result.clearTurns);
  const record = {
    ...previous,
    firstClearedAt,
    clearCount: previous.clearCount + 1,
    completedOptionalObjectiveIds: [...new Set([
      ...previous.completedOptionalObjectiveIds,
      ...result.completedOptionalObjectiveIds,
    ])],
    graduatedMinghenIds: minghen.graduated,
    ...(bestClearTurns === undefined ? {} : { bestClearTurns }),
  };

  const highestClearedFloor = Math.max(profile.highestClearedFloor, challenge.floor);
  const highestUnlockedFloor = challenge.mode === 'PROGRESSION'
    && challenge.floor === profile.highestUnlockedFloor
    ? Math.min(35, Math.max(profile.highestUnlockedFloor, challenge.floor + 1))
    : profile.highestUnlockedFloor;

  nextProfile = {
    ...nextProfile,
    highestClearedFloor,
    highestUnlockedFloor,
    floorRecords: {
      ...profile.floorRecords,
      [key]: record,
    },
    gold: profile.gold + rewards.gold,
    minghenDust: minghen.dust,
    minghenCollection: minghen.collection,
    tracking: minghen.tracking,
    equipmentInventory: rewards.equipment
      ? [...profile.equipmentInventory, rewards.equipment]
      : profile.equipmentInventory,
    professions: unlockProfessions(
      applyMastery(profile, challenge.config.professionId, rewards.masteryXp),
      challenge.floor,
      rewards.firstClear,
    ),
  };
  const rewardSnapshot = { ...rewards, minghenId: minghen.grantedId, minghenDust: minghen.dust - profile.minghenDust };
  settledChallenge.rewards = rewardSnapshot;
  return { challenge: settledChallenge, profile: nextProfile, rewards: rewardSnapshot };
}

module.exports = {
  buildChallenge,
  requestMatchesChallenge,
  validateLoadoutOwnership,
  applyChallengeStart,
  applyChallengeSettlement,
};
