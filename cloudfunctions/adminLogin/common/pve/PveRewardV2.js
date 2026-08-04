const FIRST_CLEAR_GOLD = {
  1: 20, 2: 30, 3: 40, 4: 50, 5: 60, 6: 75, 7: 120,
  8: 35, 9: 45, 10: 55, 11: 65, 12: 75, 13: 90, 14: 140,
  15: 45, 16: 55, 17: 65, 18: 75, 19: 85, 20: 100, 21: 160,
  22: 55, 23: 65, 24: 75, 25: 85, 26: 95, 27: 110, 28: 180,
  29: 65, 30: 75, 31: 85, 32: 95, 33: 110, 34: 125, 35: 200,
};
const OPTIONAL_GOLD = {};
const OPTIONAL_BY_FLOOR = {
  1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [],
  8: [], 9: [], 10: [], 11: [], 12: [], 13: [], 14: [],
  15: [], 16: [], 17: [], 18: [], 19: [], 20: [], 21: [],
  22: [], 23: [], 24: [], 25: [], 26: [], 27: [], 28: [],
  29: [], 30: [], 31: [], 32: [], 33: [], 34: [], 35: [],
};
const TECHNIQUES = {
  WARRIOR: ['ARMOR_BREAK', 'KNOCKBACK', 'SWEEP'],
  ARCHER: ['PIERCING', 'WEAK_POINT', 'SUPPRESSING'],
  RANGER: ['SHADOW_END', 'WHIRLWIND', 'VANISH_STEP'],
};
const MASTERY_XP = [0, 150, 350, 600, 900, 1250, 1650, 2100, 2600, 3200];

function levelForXp(xp) {
  let level = 1;
  for (let index = 1; index < MASTERY_XP.length; index += 1) {
    if (xp >= MASTERY_XP[index]) level = index + 1;
  }
  return level;
}

function masteryGain(profile, challenge, firstProgression, firstOptionalCount, highlightCount) {
  if (challenge.mode === 'PRACTICE') return 0;
  const floor = challenge.floor;
  const base = firstProgression ? 120 + floor * 10 : 50 + floor * 5;
  let decay = 1;
  if (!firstProgression) {
    const floorGap = Math.max(0, profile.highestUnlockedFloor - floor);
    decay = floorGap <= 1 ? 1 : floorGap <= 3 ? 0.5 : floorGap <= 6 ? 0.2 : 0.05;
  }
  const current = profile.professions[challenge.config.professionId];
  const highest = Math.max(...Object.values(profile.professions).map((entry) => entry.level));
  const levelGap = highest - current.level;
  const catchup = levelGap >= 4 ? 2 : levelGap === 3 ? 1.5 : levelGap === 2 ? 1.25 : 1;
  return Math.floor(
    (base + firstOptionalCount * 20 + Math.min(3, highlightCount) * 10) * decay * catchup,
  );
}

function applyMastery(profile, professionId, gain) {
  const current = profile.professions[professionId];
  const xp = Math.min(3200, current.xp + gain);
  const level = levelForXp(xp);
  return {
    ...profile.professions,
    [professionId]: {
      ...current,
      xp,
      level,
      unlockedTechniqueIds: TECHNIQUES[professionId].filter((_, index) => level >= [3, 5, 7][index]),
    },
  };
}

function unlockProfessions(professions, floor, firstClear) {
  let next = { ...professions };
  if (firstClear && floor === 2 && !next.ARCHER.unlocked) {
    next = { ...next, ARCHER: { ...next.ARCHER, unlocked: true, xp: 150, level: 2 } };
  }
  if (firstClear && floor === 4 && !next.RANGER.unlocked) {
    next = { ...next, RANGER: { ...next.RANGER, unlocked: true, xp: 150, level: 2 } };
  }
  return next;
}

function calculateRewards(profile, challenge, result, previous) {
  const allowed = OPTIONAL_BY_FLOOR[challenge.floor] ?? [];
  if (result.completedOptionalObjectiveIds.some((id) => !allowed.includes(id))) {
    const error = new Error('可选目标不属于当前楼层');
    error.code = 'PVE_INVALID_OPTIONAL_OBJECTIVE';
    throw error;
  }
  const firstClear = !previous.firstClearedAt;
  const firstProgression = firstClear && challenge.mode === 'PROGRESSION';
  const newOptionalObjectiveIds = result.completedOptionalObjectiveIds.filter(
    (id) => !previous.completedOptionalObjectiveIds.includes(id),
  );
  const gold = challenge.mode === 'TRIAL' || challenge.mode === 'PRACTICE'
    ? 0
    : (firstClear
      ? (FIRST_CLEAR_GOLD[challenge.floor] ?? 0)
      : Math.floor((FIRST_CLEAR_GOLD[challenge.floor] ?? 0) * 0.35))
      + newOptionalObjectiveIds.reduce((sum, id) => sum + (OPTIONAL_GOLD[id] ?? 0), 0);
  const masteryXp = challenge.mode === 'TRIAL'
    ? 0
    : masteryGain(
      profile,
      challenge,
      firstProgression,
      newOptionalObjectiveIds.length,
      result.professionHighlightCount ?? 0,
    );
  return { gold, masteryXp, firstClear, newOptionalObjectiveIds };
}

module.exports = {
  FIRST_CLEAR_GOLD,
  OPTIONAL_GOLD,
  OPTIONAL_BY_FLOOR,
  calculateRewards,
  applyMastery,
  unlockProfessions,
  levelForXp,
};
