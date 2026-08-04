const PARTNER_IDS = ['MOBILITY', 'GUARD', 'BREAKER', 'CONTROL', 'ANIMA', 'HEAL'];
const PARTNER_EVOLVE_STARDUST = [0, 0, 50, 200, 500];
const PARTNER_EVOLVE_LEVEL = [0, 1, 5, 15, 30];
const MAX_PARTNER_LEVEL = 99;

/** 通关层数门槛（不含 MOBILITY；位移仅教程发放）。 */
const PARTNER_UNLOCK_BY_CLEAR_FLOOR = {
  GUARD: 3,
  HEAL: 5,
  BREAKER: 7,
  CONTROL: 10,
  ANIMA: 17,
};

function lockedProgress() {
  return { unlocked: false, level: 1, exp: 0, evolutionStage: 1 };
}

function unlockedProgress() {
  return { unlocked: true, level: 1, exp: 0, evolutionStage: 1 };
}

function defaultProgress() {
  return lockedProgress();
}

function createDefaultPartnersMap() {
  const partners = {};
  for (const id of PARTNER_IDS) partners[id] = lockedProgress();
  return partners;
}

function createLegacyAllUnlockedMap() {
  const partners = {};
  for (const id of PARTNER_IDS) partners[id] = unlockedProgress();
  return partners;
}

function clampStage(value) {
  const n = Number(value);
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function normalizeOne(raw) {
  if (!raw || typeof raw !== 'object') return lockedProgress();
  return {
    unlocked: raw.unlocked === true,
    level: Math.max(1, Math.min(MAX_PARTNER_LEVEL, Number.isFinite(Number(raw.level)) ? Math.trunc(Number(raw.level)) : 1)),
    exp: Math.max(0, Number.isFinite(Number(raw.exp)) ? Math.trunc(Number(raw.exp)) : 0),
    evolutionStage: clampStage(raw.evolutionStage),
  };
}

function resolvePartnerUnlockScheme(rawPartners, equippedPartnerId, highestClearedFloor, schemeRaw) {
  if (schemeRaw === 'legacy' || schemeRaw === 'progressive') return schemeRaw;
  const src = rawPartners && typeof rawPartners === 'object' ? rawPartners : null;
  if (src) {
    for (const id of PARTNER_IDS) {
      if (src[id] && typeof src[id] === 'object' && src[id].unlocked === true) return 'legacy';
    }
  }
  const cleared = Number(highestClearedFloor);
  if (!src && Number.isFinite(cleared) && cleared > 0) return 'legacy';
  return 'progressive';
}

function normalizePartnersMap(rawPartners, equippedPartnerId, opts = {}) {
  const scheme = resolvePartnerUnlockScheme(
    rawPartners,
    equippedPartnerId,
    opts.highestClearedFloor,
    opts.partnerUnlockScheme,
  );
  const src = rawPartners && typeof rawPartners === 'object' ? rawPartners : null;
  let partners;
  if (!src && scheme === 'legacy') {
    partners = createLegacyAllUnlockedMap();
  } else {
    partners = {};
    const defaults = createDefaultPartnersMap();
    for (const id of PARTNER_IDS) {
      partners[id] = src && src[id] !== undefined ? normalizeOne(src[id]) : defaults[id];
    }
  }
  const equipped = typeof equippedPartnerId === 'string'
    && PARTNER_IDS.includes(equippedPartnerId)
    && partners[equippedPartnerId].unlocked
    ? equippedPartnerId
    : null;
  return { partners, equippedPartnerId: equipped, partnerUnlockScheme: scheme };
}

function partnerUnlockHint(partnerId) {
  if (partnerId === 'MOBILITY') return '进入新手教程解锁';
  const floor = PARTNER_UNLOCK_BY_CLEAR_FLOOR[partnerId];
  if (floor != null) return `通关第 ${floor} 层解锁`;
  return '未解锁';
}

function applyPartnerUnlocks(partners, clearedFloor) {
  const floor = Math.max(0, Math.trunc(clearedFloor || 0));
  const next = { ...partners };
  const newlyUnlockedPartnerIds = [];
  for (const id of PARTNER_IDS) {
    const need = PARTNER_UNLOCK_BY_CLEAR_FLOOR[id];
    if (need == null) continue;
    const cur = next[id] || lockedProgress();
    if (!cur.unlocked && floor >= need) {
      next[id] = { ...cur, unlocked: true };
      newlyUnlockedPartnerIds.push(id);
    } else {
      next[id] = cur;
    }
  }
  return { partners: next, newlyUnlockedPartnerIds };
}

function applyPartnerUnlocksOnProfile(profile, clearedFloor) {
  if (profile.partnerUnlockScheme === 'legacy') {
    return { profile, newlyUnlockedPartnerIds: [] };
  }
  const { partners, equippedPartnerId, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    { partnerUnlockScheme: profile.partnerUnlockScheme, highestClearedFloor: profile.highestClearedFloor },
  );
  const applied = applyPartnerUnlocks(partners, clearedFloor);
  return {
    profile: {
      ...profile,
      partners: applied.partners,
      equippedPartnerId,
      partnerUnlockScheme,
    },
    newlyUnlockedPartnerIds: applied.newlyUnlockedPartnerIds,
  };
}

function grantStarterPartnerOnProfile(profile) {
  if (profile.partnerUnlockScheme === 'legacy') {
    return { profile, newlyUnlockedPartnerIds: [] };
  }
  const { partners, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    { partnerUnlockScheme: profile.partnerUnlockScheme || 'progressive', highestClearedFloor: profile.highestClearedFloor },
  );
  const cur = partners.MOBILITY || lockedProgress();
  const newlyUnlockedPartnerIds = [];
  let nextMobility = cur;
  if (!cur.unlocked) {
    nextMobility = { ...cur, unlocked: true };
    newlyUnlockedPartnerIds.push('MOBILITY');
  }
  return {
    profile: {
      ...profile,
      partners: { ...partners, MOBILITY: nextMobility },
      equippedPartnerId: 'MOBILITY',
      partnerUnlockScheme: partnerUnlockScheme || 'progressive',
    },
    newlyUnlockedPartnerIds,
  };
}

function xpRequiredForLevel(level) {
  const lv = Math.max(1, Math.trunc(level));
  return 30 + lv * 15;
}

function grantPartnerExp(progress, amount) {
  if (!progress.unlocked || amount <= 0) return progress;
  let level = Math.max(1, progress.level);
  let exp = Math.max(0, progress.exp) + Math.trunc(amount);
  while (level < MAX_PARTNER_LEVEL) {
    const need = xpRequiredForLevel(level);
    if (exp < need) break;
    exp -= need;
    level += 1;
  }
  if (level >= MAX_PARTNER_LEVEL) exp = 0;
  return { ...progress, level, exp };
}

function partnerClearExp(clearedFloor) {
  return 30 + Math.max(0, Math.trunc(clearedFloor));
}

/** 首版试炼接口恒通过。 */
function hasCompletedPartnerTrial() {
  return true;
}

function evolvePartnerOnProfile(profile, partnerId) {
  if (!PARTNER_IDS.includes(partnerId)) {
    const err = new Error('未知伙伴');
    err.code = 'PVE_PARTNER_UNKNOWN';
    throw err;
  }
  const { partners, equippedPartnerId, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    { partnerUnlockScheme: profile.partnerUnlockScheme, highestClearedFloor: profile.highestClearedFloor },
  );
  const progress = partners[partnerId];
  if (!progress.unlocked) {
    const err = new Error('伙伴未解锁');
    err.code = 'PVE_PARTNER_LOCKED';
    throw err;
  }
  if (progress.evolutionStage >= 4) {
    const err = new Error('已达最高阶段');
    err.code = 'PVE_PARTNER_MAX_STAGE';
    throw err;
  }
  const toStage = progress.evolutionStage + 1;
  const needLevel = PARTNER_EVOLVE_LEVEL[toStage];
  if (progress.level < needLevel) {
    const err = new Error('伙伴等级不足');
    err.code = 'PVE_PARTNER_LEVEL_LOW';
    throw err;
  }
  const cost = PARTNER_EVOLVE_STARDUST[toStage];
  const gold = Number.isFinite(profile.gold) ? profile.gold : 0;
  if (gold < cost) {
    const err = new Error('星尘不足');
    err.code = 'PVE_PARTNER_STARDUST_LOW';
    throw err;
  }
  if (toStage >= 3 && !hasCompletedPartnerTrial(partnerId, toStage)) {
    const err = new Error('试炼未完成');
    err.code = 'PVE_PARTNER_TRIAL_INCOMPLETE';
    throw err;
  }
  return {
    ...profile,
    gold: gold - cost,
    partners: {
      ...partners,
      [partnerId]: { ...progress, evolutionStage: toStage },
    },
    equippedPartnerId,
    partnerUnlockScheme,
  };
}

function equipPartnerOnProfile(profile, partnerId) {
  const { partners, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    { partnerUnlockScheme: profile.partnerUnlockScheme, highestClearedFloor: profile.highestClearedFloor },
  );
  if (partnerId == null || partnerId === '') {
    return {
      ...profile,
      partners,
      equippedPartnerId: null,
      partnerUnlockScheme,
    };
  }
  if (!PARTNER_IDS.includes(partnerId)) {
    const err = new Error('未知伙伴');
    err.code = 'PVE_PARTNER_UNKNOWN';
    throw err;
  }
  if (!partners[partnerId].unlocked) {
    const err = new Error('伙伴未解锁');
    err.code = 'PVE_PARTNER_LOCKED';
    throw err;
  }
  return {
    ...profile,
    partners,
    equippedPartnerId: partnerId,
    partnerUnlockScheme,
  };
}

function grantClearExpOnProfile(profile, partnerId, clearedFloor) {
  if (!partnerId || !PARTNER_IDS.includes(partnerId)) return profile;
  const { partners, equippedPartnerId, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    { partnerUnlockScheme: profile.partnerUnlockScheme, highestClearedFloor: profile.highestClearedFloor },
  );
  if (!partners[partnerId]?.unlocked) return profile;
  return {
    ...profile,
    partners: {
      ...partners,
      [partnerId]: grantPartnerExp(partners[partnerId], partnerClearExp(clearedFloor)),
    },
    equippedPartnerId,
    partnerUnlockScheme,
  };
}

/** GM：六只全开锁；保留养成；不切 legacy。 */
function unlockAllPartnersOnProfile(profile) {
  const { partners, equippedPartnerId, partnerUnlockScheme } = normalizePartnersMap(
    profile.partners,
    profile.equippedPartnerId,
    {
      partnerUnlockScheme: profile.partnerUnlockScheme || 'progressive',
      highestClearedFloor: profile.highestClearedFloor,
    },
  );
  const nextPartners = {};
  for (const id of PARTNER_IDS) {
    const cur = partners[id] || lockedProgress();
    nextPartners[id] = { ...cur, unlocked: true };
  }
  const nextEquipped = equippedPartnerId && nextPartners[equippedPartnerId]?.unlocked
    ? equippedPartnerId
    : 'MOBILITY';
  return {
    ...profile,
    partners: nextPartners,
    equippedPartnerId: nextEquipped,
    partnerUnlockScheme: partnerUnlockScheme === 'legacy' ? 'legacy' : 'progressive',
  };
}

module.exports = {
  PARTNER_IDS,
  PARTNER_EVOLVE_STARDUST,
  PARTNER_EVOLVE_LEVEL,
  PARTNER_UNLOCK_BY_CLEAR_FLOOR,
  createDefaultPartnersMap,
  normalizePartnersMap,
  partnerUnlockHint,
  applyPartnerUnlocks,
  applyPartnerUnlocksOnProfile,
  grantStarterPartnerOnProfile,
  unlockAllPartnersOnProfile,
  grantPartnerExp,
  partnerClearExp,
  evolvePartnerOnProfile,
  equipPartnerOnProfile,
  grantClearExpOnProfile,
  hasCompletedPartnerTrial,
};
