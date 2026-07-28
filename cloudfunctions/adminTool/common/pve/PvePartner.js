const PARTNER_IDS = ['MOBILITY', 'GUARD', 'BREAKER', 'CONTROL', 'ANIMA', 'HEAL'];
const PARTNER_EVOLVE_STARDUST = [0, 0, 50, 200, 500];
const PARTNER_EVOLVE_LEVEL = [0, 1, 5, 15, 30];
const MAX_PARTNER_LEVEL = 99;

function defaultProgress() {
  return { unlocked: true, level: 1, exp: 0, evolutionStage: 1 };
}

function createDefaultPartnersMap() {
  const partners = {};
  for (const id of PARTNER_IDS) partners[id] = defaultProgress();
  return partners;
}

function clampStage(value) {
  const n = Number(value);
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function normalizeOne(raw) {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  return {
    unlocked: raw.unlocked !== false,
    level: Math.max(1, Math.min(MAX_PARTNER_LEVEL, Number.isFinite(Number(raw.level)) ? Math.trunc(Number(raw.level)) : 1)),
    exp: Math.max(0, Number.isFinite(Number(raw.exp)) ? Math.trunc(Number(raw.exp)) : 0),
    evolutionStage: clampStage(raw.evolutionStage),
  };
}

function normalizePartnersMap(rawPartners, equippedPartnerId) {
  const defaults = createDefaultPartnersMap();
  const src = rawPartners && typeof rawPartners === 'object' ? rawPartners : {};
  const partners = {};
  for (const id of PARTNER_IDS) {
    partners[id] = src[id] !== undefined ? normalizeOne(src[id]) : defaults[id];
  }
  const equipped = typeof equippedPartnerId === 'string'
    && PARTNER_IDS.includes(equippedPartnerId)
    && partners[equippedPartnerId].unlocked
    ? equippedPartnerId
    : 'MOBILITY';
  return { partners, equippedPartnerId: equipped };
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
  const { partners, equippedPartnerId } = normalizePartnersMap(profile.partners, profile.equippedPartnerId);
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
  };
}

function equipPartnerOnProfile(profile, partnerId) {
  const { partners } = normalizePartnersMap(profile.partners, profile.equippedPartnerId);
  if (partnerId != null && partnerId !== '') {
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
  }
  const equipped = partnerId == null || partnerId === '' ? 'MOBILITY' : partnerId;
  return {
    ...profile,
    partners,
    equippedPartnerId: equipped,
  };
}

function grantClearExpOnProfile(profile, partnerId, clearedFloor) {
  if (!partnerId || !PARTNER_IDS.includes(partnerId)) return profile;
  const { partners, equippedPartnerId } = normalizePartnersMap(profile.partners, profile.equippedPartnerId);
  if (!partners[partnerId]?.unlocked) return profile;
  return {
    ...profile,
    partners: {
      ...partners,
      [partnerId]: grantPartnerExp(partners[partnerId], partnerClearExp(clearedFloor)),
    },
    equippedPartnerId,
  };
}

module.exports = {
  PARTNER_IDS,
  PARTNER_EVOLVE_STARDUST,
  PARTNER_EVOLVE_LEVEL,
  createDefaultPartnersMap,
  normalizePartnersMap,
  grantPartnerExp,
  partnerClearExp,
  evolvePartnerOnProfile,
  equipPartnerOnProfile,
  grantClearExpOnProfile,
  hasCompletedPartnerTrial,
};
