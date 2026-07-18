const { generateId } = require('../id');
const { calculateRewards, applyMastery, unlockProfessions } = require('./PveRewardV2');
const { settleMinghen } = require('./PveMinghen');
const { MAX_READY_FLOOR } = require('./PveProfile');
const { grantClearExpOnProfile } = require('./PvePartner');

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
  const partnerId = request.partnerId ?? null;
  const partnerEvolutionStage = request.partnerEvolutionStage ?? 1;
  const partnerLevel = request.partnerLevel ?? 1;
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
      partnerId,
      partnerEvolutionStage,
      partnerLevel,
    },
    startedAt: now,
    updatedAt: now,
  };
}

function requestMatchesChallenge(request, challenge) {
  if (!challenge || challenge.status !== 'ACTIVE') return false;
  const reqPartner = request.partnerId ?? null;
  const cfgPartner = challenge.config.partnerId ?? null;
  return request.floor === challenge.floor
    && request.mode === challenge.mode
    && request.professionId === challenge.config.professionId
    && request.trackedMinghenId === challenge.config.trackedMinghenId
    && reqPartner === cfgPartner
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

/**
 * 击杀掉落入账永久背包，并可选写回穿戴。
 * 死亡/撤退也保留掉落，保证「怪物身上拿到的装备永久存放」。
 */
function applyCombatEquipmentGrants(profile, challenge, result) {
  const looted = result.lootedEquipment ?? [];
  const ownedIds = new Set(profile.equipmentInventory.map((item) => item.instanceId));
  const added = [];
  for (const item of looted) {
    if (ownedIds.has(item.instanceId)) continue;
    added.push(item);
    ownedIds.add(item.instanceId);
  }
  const equipmentInventory = added.length > 0
    ? [...profile.equipmentInventory, ...added]
    : profile.equipmentInventory;
  if (equipmentInventory.length > 60) {
    const err = new Error('装备背包已满，请先出售装备');
    err.code = 'PVE_EQUIPMENT_INVENTORY_FULL';
    throw err;
  }

  let equipmentLoadout = profile.equipmentLoadout;
  if (result.equipmentLoadout) {
    const inventoryIds = new Set(equipmentInventory.map((item) => item.instanceId));
    const equippedIds = Object.values(result.equipmentLoadout);
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
    equipmentLoadout = stableEquipment(result.equipmentLoadout);
  }

  return { equipmentInventory, equipmentLoadout, added };
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
      lootedEquipment: result.lootedEquipment,
      lootedStardust: result.lootedStardust,
      equipmentLoadout: result.equipmentLoadout,
      huntBonusAchieved: result.huntBonusAchieved,
      trialCompleted: result.trialCompleted,
      trialEvidence: result.trialEvidence,
    },
    rewards: {},
    updatedAt: now,
  };

  const combatLoot = applyCombatEquipmentGrants(profile, challenge, result);
  const lootedStardust = Number.isInteger(result.lootedStardust) && result.lootedStardust > 0
    ? result.lootedStardust
    : 0;
  let nextProfile = {
    ...profile,
    activeChallengeId: profile.activeChallengeId === challenge.challengeId
      ? null
      : profile.activeChallengeId,
    equipmentInventory: combatLoot.equipmentInventory,
    equipmentLoadout: combatLoot.equipmentLoadout,
    gold: profile.gold + lootedStardust,
    minghenDust: 0,
    updatedAt: now,
  };

  if (result.status !== 'CLEAR') {
    const rewards = {
      ...(combatLoot.added.length > 0 ? { lootedEquipment: combatLoot.added } : {}),
      ...(lootedStardust > 0 ? { lootedStardust } : {}),
    };
    settledChallenge.rewards = rewards;
    return { challenge: settledChallenge, profile: nextProfile, rewards };
  }

  const key = String(challenge.floor);
  const previous = profile.floorRecords[key] ?? {
    clearCount: 0,
    completedOptionalObjectiveIds: [],
    graduatedMinghenIds: [],
  };
  const rewards = calculateRewards(profile, challenge, result, previous);
  const minghen = settleMinghen(profile, challenge, result, previous);
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

  const isNewHighest = challenge.floor > profile.highestClearedFloor;
  const highestClearedFloor = Math.max(profile.highestClearedFloor, challenge.floor);
  const highestClearedAt = isNewHighest ? now : profile.highestClearedAt;
  const highestUnlockedFloor = challenge.mode === 'PROGRESSION'
    && challenge.floor === profile.highestUnlockedFloor
    ? Math.min(MAX_READY_FLOOR, Math.max(profile.highestUnlockedFloor, challenge.floor + 1))
    : profile.highestUnlockedFloor;

  nextProfile = {
    ...nextProfile,
    highestClearedFloor,
    highestClearedAt,
    highestUnlockedFloor,
    floorRecords: {
      ...profile.floorRecords,
      [key]: record,
    },
    gold: nextProfile.gold + rewards.gold + Math.max(0, minghen.dust - profile.minghenDust),
    minghenDust: 0,
    minghenCollection: minghen.collection,
    tracking: minghen.tracking,
    equipmentInventory: nextProfile.equipmentInventory,
    professions: unlockProfessions(
      applyMastery(profile, challenge.config.professionId, rewards.masteryXp),
      challenge.floor,
      rewards.firstClear,
    ),
  };
  // 携带伙伴通关经验：仅 CLEAR，按快照 partnerId，不可由客户端伪造更高阶段。
  if (challenge.config.partnerId) {
    nextProfile = grantClearExpOnProfile(nextProfile, challenge.config.partnerId, challenge.floor);
  }
  const minghenDustGain = Math.max(0, minghen.dust - profile.minghenDust);
  const rewardSnapshot = {
    ...rewards,
    minghenId: minghen.grantedId,
    minghenDust: minghenDustGain,
    stardust: rewards.gold + lootedStardust + minghenDustGain,
    ...(lootedStardust > 0 ? { lootedStardust } : {}),
    ...(combatLoot.added.length > 0 ? { lootedEquipment: combatLoot.added } : {}),
  };
  settledChallenge.rewards = rewardSnapshot;
  return { challenge: settledChallenge, profile: nextProfile, rewards: rewardSnapshot };
}

module.exports = {
  buildChallenge,
  requestMatchesChallenge,
  validateLoadoutOwnership,
  applyChallengeStart,
  applyChallengeSettlement,
  applyCombatEquipmentGrants,
};
