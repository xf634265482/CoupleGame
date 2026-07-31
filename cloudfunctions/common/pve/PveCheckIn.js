const MILESTONES = [1, 3, 7, 15, 20];

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function shanghaiCalendar(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day, monthKey, daysInMonth };
}

function dailyRewardForDay(day) {
  const rem = day % 7;
  if (rem === 1) return { gold: 30 };
  if (rem === 2) return { quenchSand: 2 };
  if (rem === 3) return { gold: 40 };
  if (rem === 4) return { quenchSand: 3 };
  if (rem === 5) return { gold: 50, quenchSand: 1 };
  if (rem === 6) return { fusionCore: 1 };
  return { gold: 60, voidHide: 1 };
}

function milestoneReward(days) {
  if (days === 1) return { gold: 50 };
  if (days === 3) return { quenchSand: 3 };
  if (days === 7) return { gold: 100, makeupCards: 1 };
  if (days === 15) return { quenchSand: 5, fusionCore: 1 };
  if (days === 20) return { gold: 200, voidHide: 2, fusionCore: 1 };
  fail('PVE_MILESTONE_NOT_REACHED', '无效累计档位');
}

function emptyCheckIn(monthKey) {
  return { monthKey, signedDays: [], claimedMilestones: [], makeupCards: 0 };
}

function normalizeCheckIn(value, nowMs = Date.now()) {
  const { monthKey } = shanghaiCalendar(nowMs);
  const src = value && typeof value === 'object' ? value : {};
  const cards = Number.isInteger(src.makeupCards) && src.makeupCards >= 0 ? src.makeupCards : 0;
  if (src.monthKey !== monthKey) {
    return { ...emptyCheckIn(monthKey), makeupCards: cards };
  }
  const signedDays = Array.isArray(src.signedDays)
    ? [...new Set(src.signedDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b)
    : [];
  const claimedMilestones = Array.isArray(src.claimedMilestones)
    ? [...new Set(src.claimedMilestones.filter((d) => MILESTONES.includes(d)))].sort((a, b) => a - b)
    : [];
  return { monthKey, signedDays, claimedMilestones, makeupCards: cards };
}

function normalizeMaterials(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    quenchSand: Number.isInteger(src.quenchSand) && src.quenchSand >= 0 ? src.quenchSand : 0,
    fusionCore: Number.isInteger(src.fusionCore) && src.fusionCore >= 0 ? src.fusionCore : 0,
    voidHide: Number.isInteger(src.voidHide) && src.voidHide >= 0 ? src.voidHide : 0,
  };
}

function applyGrant(profile, grant, nowMs) {
  const materials = normalizeMaterials(profile.materials);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  return {
    ...profile,
    gold: (profile.gold || 0) + (grant.gold || 0),
    materials: {
      quenchSand: materials.quenchSand + (grant.quenchSand || 0),
      fusionCore: materials.fusionCore + (grant.fusionCore || 0),
      voidHide: materials.voidHide + (grant.voidHide || 0),
    },
    checkIn: {
      ...checkIn,
      makeupCards: checkIn.makeupCards + (grant.makeupCards || 0),
    },
    updatedAt: nowMs,
  };
}

function applySignToday(profile, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  if (checkIn.signedDays.includes(cal.day)) {
    fail('PVE_CHECKIN_ALREADY_SIGNED', '今日已签到');
  }
  const gained = dailyRewardForDay(cal.day);
  let next = applyGrant({ ...profile, checkIn }, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      signedDays: [...next.checkIn.signedDays, cal.day].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function applyMakeup(profile, day, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const target = Number(day);
  if (!Number.isInteger(target) || target < 1 || target > cal.daysInMonth || target >= cal.day) {
    fail('PVE_CHECKIN_INVALID_DAY', '补签日期无效');
  }
  if (checkIn.signedDays.includes(target)) {
    fail('PVE_CHECKIN_ALREADY_SIGNED', '该日已签到');
  }
  if (checkIn.makeupCards < 1) {
    fail('PVE_MAKEUP_CARD_NOT_ENOUGH', '补签卡不足');
  }
  const gained = dailyRewardForDay(target);
  let next = applyGrant({
    ...profile,
    checkIn: { ...checkIn, makeupCards: checkIn.makeupCards - 1 },
  }, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      signedDays: [...next.checkIn.signedDays, target].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function applyClaimMilestone(profile, days, nowMs = Date.now()) {
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const target = Number(days);
  if (!MILESTONES.includes(target)) {
    fail('PVE_MILESTONE_NOT_REACHED', '无效累计档位');
  }
  if (checkIn.signedDays.length < target) {
    fail('PVE_MILESTONE_NOT_REACHED', '累计签到未达标');
  }
  if (checkIn.claimedMilestones.includes(target)) {
    fail('PVE_MILESTONE_ALREADY_CLAIMED', '该累计奖励已领取');
  }
  const gained = milestoneReward(target);
  let next = applyGrant(profile, gained, nowMs);
  next = {
    ...next,
    checkIn: {
      ...next.checkIn,
      claimedMilestones: [...next.checkIn.claimedMilestones, target].sort((a, b) => a - b),
    },
  };
  return { profile: next, gained };
}

function buildState(profile, nowMs = Date.now()) {
  const cal = shanghaiCalendar(nowMs);
  const checkIn = normalizeCheckIn(profile.checkIn, nowMs);
  const calendar = [];
  for (let d = 1; d <= cal.daysInMonth; d += 1) {
    calendar.push({
      day: d,
      reward: dailyRewardForDay(d),
      signed: checkIn.signedDays.includes(d),
      canMakeup: d < cal.day && !checkIn.signedDays.includes(d),
    });
  }
  const claimableMilestones = MILESTONES.filter(
    (m) => checkIn.signedDays.length >= m && !checkIn.claimedMilestones.includes(m),
  );
  return {
    monthKey: checkIn.monthKey,
    today: cal.day,
    signedDays: checkIn.signedDays,
    claimedMilestones: checkIn.claimedMilestones,
    makeupCards: checkIn.makeupCards,
    canSignToday: !checkIn.signedDays.includes(cal.day),
    claimableMilestones,
    milestones: MILESTONES.map((days) => ({
      days,
      reward: milestoneReward(days),
      reached: checkIn.signedDays.length >= days,
      claimed: checkIn.claimedMilestones.includes(days),
    })),
    calendar,
  };
}

function hasCheckInRedDot(state) {
  return Boolean(state.canSignToday || (state.claimableMilestones && state.claimableMilestones.length > 0));
}

module.exports = {
  MILESTONES,
  shanghaiCalendar,
  dailyRewardForDay,
  milestoneReward,
  normalizeCheckIn,
  applySignToday,
  applyMakeup,
  applyClaimMilestone,
  buildState,
  hasCheckInRedDot,
  fail,
};
