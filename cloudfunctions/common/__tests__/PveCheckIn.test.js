const { createDefaultProfile } = require('../pve/PveProfile');
const {
  dailyRewardForDay,
  milestoneReward,
  applySignToday,
  applyMakeup,
  applyClaimMilestone,
  normalizeCheckIn,
} = require('../pve/PveCheckIn');

/** Fixed: 2026-07-15 12:00 Asia/Shanghai = 2026-07-15 04:00 UTC */
const NOW = Date.UTC(2026, 6, 15, 4, 0, 0);

function baseProfile(extra = {}) {
  const p = createDefaultProfile(NOW);
  return {
    ...p,
    gold: 100,
    materials: { quenchSand: 0, fusionCore: 0, voidHide: 0 },
    checkIn: normalizeCheckIn({
      monthKey: '2026-07',
      signedDays: [],
      claimedMilestones: [],
      makeupCards: 0,
    }, NOW),
    ...extra,
  };
}

describe('PveCheckIn rewards', () => {
  test('7-day cycle: day 7/14/28 give voidHide', () => {
    expect(dailyRewardForDay(7)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(14)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(28)).toEqual({ gold: 60, voidHide: 1 });
    expect(dailyRewardForDay(6)).toEqual({ fusionCore: 1 });
    expect(dailyRewardForDay(1)).toEqual({ gold: 30 });
  });

  test('milestone 7 includes makeup card', () => {
    expect(milestoneReward(7)).toEqual({ gold: 100, makeupCards: 1 });
  });
});

describe('PveCheckIn sign / makeup / claim', () => {
  test('sign today grants daily and marks day', () => {
    const { profile, gained } = applySignToday(baseProfile(), NOW);
    expect(gained).toEqual(dailyRewardForDay(15));
    expect(profile.checkIn.signedDays).toContain(15);
    expect(profile.gold).toBe(100 + (gained.gold || 0));
  });

  test('double sign fails', () => {
    const once = applySignToday(baseProfile(), NOW).profile;
    expect(() => applySignToday(once, NOW)).toThrow(/已签/);
  });

  test('month rollover clears signed/claimed keeps cards', () => {
    const august = Date.UTC(2026, 7, 1, 4, 0, 0); // 2026-08-01 12:00 CST
    const p = baseProfile({
      checkIn: {
        monthKey: '2026-07',
        signedDays: [1, 2, 3],
        claimedMilestones: [1, 3],
        makeupCards: 2,
      },
    });
    const next = normalizeCheckIn(p.checkIn, august);
    expect(next.monthKey).toBe('2026-08');
    expect(next.signedDays).toEqual([]);
    expect(next.claimedMilestones).toEqual([]);
    expect(next.makeupCards).toBe(2);
  });

  test('makeup spends card and grants that day reward', () => {
    const p = baseProfile({
      checkIn: normalizeCheckIn({
        monthKey: '2026-07',
        signedDays: [15],
        claimedMilestones: [],
        makeupCards: 1,
      }, NOW),
    });
    const { profile, gained } = applyMakeup(p, 10, NOW);
    expect(gained).toEqual(dailyRewardForDay(10));
    expect(profile.checkIn.makeupCards).toBe(0);
    expect(profile.checkIn.signedDays).toEqual(expect.arrayContaining([10, 15]));
  });

  test('makeup without card fails', () => {
    expect(() => applyMakeup(baseProfile(), 10, NOW)).toThrow(/补签卡/);
  });

  test('claim milestone 7 once; second fails', () => {
    const p = baseProfile({
      checkIn: normalizeCheckIn({
        monthKey: '2026-07',
        signedDays: [1, 2, 3, 4, 5, 6, 7],
        claimedMilestones: [],
        makeupCards: 0,
      }, NOW),
    });
    const first = applyClaimMilestone(p, 7, NOW);
    expect(first.gained).toEqual({ gold: 100, makeupCards: 1 });
    expect(first.profile.checkIn.makeupCards).toBe(1);
    expect(() => applyClaimMilestone(first.profile, 7, NOW)).toThrow(/已领/);
  });

  test('claim before reach fails', () => {
    expect(() => applyClaimMilestone(baseProfile(), 3, NOW)).toThrow(/未达标|未达到/);
  });
});
