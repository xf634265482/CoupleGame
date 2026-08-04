const { createDefaultProfile } = require('../pve/PveProfile');
const {
  buyStardustSlot,
  claimExchangeRecipe,
  ensureDailyShop,
  generateShop,
  isTeaching,
  refreshDailyShop,
  spareCopies,
} = require('../pve/PveMinghenShop');
const { grantCopy } = require('../pve/PveMinghen');

describe('PveMinghenShop', () => {
  test('teaching ids never appear as shop outputs', () => {
    const shop = generateShop('2026-07-18', 'seed', 5, {});
    for (const slot of shop.stardustSlots) {
      expect(isTeaching(slot.minghenId)).toBe(false);
    }
    for (const recipe of shop.exchangeRecipes) {
      expect(isTeaching(recipe.outputId)).toBe(false);
    }
  });

  test('ensureDailyShop regenerates empty shop once expedition unlocks', () => {
    let profile = {
      ...createDefaultProfile(1),
      highestClearedFloor: 0,
      highestUnlockedFloor: 1,
      minghenDailyShop: {
        dayKey: '2026-07-18',
        stardustSlots: [],
        exchangeRecipes: [],
        adRefreshUsed: 0,
      },
    };
    profile = ensureDailyShop(profile, 'u1', Date.parse('2026-07-18T12:00:00+08:00'));
    expect(profile.minghenDailyShop.stardustSlots.length).toBe(4);
    expect(profile.minghenDailyShop.exchangeRecipes.length).toBeGreaterThan(0);
  });

  test('ensureDailyShop regenerates when day changes', () => {
    let profile = { ...createDefaultProfile(1), highestClearedFloor: 2, highestUnlockedFloor: 3 };
    profile = ensureDailyShop(profile, 'u1', Date.parse('2026-07-18T04:00:00+08:00'));
    const dayA = profile.minghenDailyShop.dayKey;
    profile = ensureDailyShop(profile, 'u1', Date.parse('2026-07-19T04:00:00+08:00'));
    expect(profile.minghenDailyShop.dayKey).not.toBe(dayA);
  });

  test('buy stardust slot spends gold and grants a general copy', () => {
    let profile = {
      ...createDefaultProfile(1),
      highestClearedFloor: 0,
      highestUnlockedFloor: 1,
      gold: 200,
      minghenCollection: {},
    };
    profile = ensureDailyShop(profile, 'buyer', Date.parse('2026-07-18T12:00:00+08:00'));
    const slot = profile.minghenDailyShop.stardustSlots[0];
    const next = buyStardustSlot(profile, { slotId: slot.slotId }, 'buyer', Date.parse('2026-07-18T12:00:00+08:00'));
    expect(next.gold).toBe(200 - slot.price);
    expect(next.minghenCollection[slot.minghenId].copies).toBe(1);
    expect(next.minghenDailyShop.stardustSlots.find((x) => x.slotId === slot.slotId).purchased).toBe(true);
  });

  test('exchange refuses spending non-spare copies', () => {
    let collection = {};
    collection = grantCopy(collection, 'M01');
    expect(spareCopies(collection.M01)).toBe(0);
    let profile = {
      ...createDefaultProfile(1),
      highestClearedFloor: 2,
      minghenCollection: collection,
      minghenDailyShop: {
        dayKey: '2026-07-18',
        stardustSlots: [],
        exchangeRecipes: [{
          recipeId: 'r0',
          inputIds: ['M01', 'M02'],
          outputId: 'M39',
          claimed: false,
        }],
        adRefreshUsed: 0,
      },
    };
    expect(() => claimExchangeRecipe(profile, { recipeId: 'r0' }, 'u', Date.parse('2026-07-18T12:00:00+08:00')))
      .toThrow(/多余/);
  });

  test('exchange spends spare copies and grants output', () => {
    let collection = {};
    for (let i = 0; i < 3; i += 1) collection = grantCopy(collection, 'M01');
    for (let i = 0; i < 3; i += 1) collection = grantCopy(collection, 'M02');
    expect(spareCopies(collection.M01)).toBe(2);
    let profile = {
      ...createDefaultProfile(1),
      highestClearedFloor: 2,
      minghenCollection: collection,
      minghenDailyShop: {
        dayKey: '2026-07-18',
        stardustSlots: [],
        exchangeRecipes: [{
          recipeId: 'r0',
          inputIds: ['M01', 'M02'],
          outputId: 'M39',
          claimed: false,
        }],
        adRefreshUsed: 0,
      },
    };
    const next = claimExchangeRecipe(profile, { recipeId: 'r0' }, 'u', Date.parse('2026-07-18T12:00:00+08:00'));
    expect(next.minghenCollection.M01.copies).toBe(2);
    expect(next.minghenCollection.M02.copies).toBe(2);
    expect(next.minghenCollection.M39.copies).toBe(1);
    expect(next.minghenDailyShop.exchangeRecipes[0].claimed).toBe(true);
  });

  test('ad refresh is capped at once per day', () => {
    let profile = {
      ...createDefaultProfile(1),
      highestClearedFloor: 2,
    };
    const now = Date.parse('2026-07-18T12:00:00+08:00');
    profile = ensureDailyShop(profile, 'u', now);
    profile = refreshDailyShop(profile, {}, 'u', now);
    expect(profile.minghenDailyShop.adRefreshUsed).toBe(1);
    expect(() => refreshDailyShop(profile, {}, 'u', now)).toThrow(/刷新/);
  });
});
