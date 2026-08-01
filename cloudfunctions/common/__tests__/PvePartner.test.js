const { normalizeProfile } = require('../pve/PveProfile');
const {
  evolvePartnerOnProfile,
  equipPartnerOnProfile,
  applyPartnerUnlocksOnProfile,
  grantStarterPartnerOnProfile,
  unlockAllPartnersOnProfile,
} = require('../pve/PvePartner');

describe('PvePartner', () => {
  test('normalize defaults progressive locked partners', () => {
    const p = normalizeProfile({ version: 1, highestUnlockedFloor: 1, highestClearedFloor: 0 });
    expect(p.equippedPartnerId).toBeNull();
    expect(p.partnerUnlockScheme).toBe('progressive');
    expect(p.partners.HEAL.unlocked).toBe(false);
    expect(p.partners.MOBILITY.unlocked).toBe(false);
  });

  test('legacy keeps unlocked partners', () => {
    const p = normalizeProfile({
      version: 1,
      partners: {
        MOBILITY: { unlocked: true, level: 1, exp: 0, evolutionStage: 1 },
        GUARD: { unlocked: true, level: 1, exp: 0, evolutionStage: 1 },
      },
      equippedPartnerId: 'GUARD',
    });
    expect(p.partnerUnlockScheme).toBe('legacy');
    expect(p.partners.MOBILITY.unlocked).toBe(true);
    expect(p.partners.GUARD.unlocked).toBe(true);
    expect(p.equippedPartnerId).toBe('GUARD');
  });

  test('apply unlocks by cleared floor', () => {
    let p = normalizeProfile({ version: 1 });
    const { profile, newlyUnlockedPartnerIds } = applyPartnerUnlocksOnProfile(p, 7);
    expect(newlyUnlockedPartnerIds).toEqual(['GUARD', 'BREAKER', 'HEAL']);
    expect(profile.partners.BREAKER.unlocked).toBe(true);
    expect(profile.partners.CONTROL.unlocked).toBe(false);
  });

  test('grant starter partner is idempotent', () => {
    let p = normalizeProfile({ version: 1 });
    const first = grantStarterPartnerOnProfile(p);
    expect(first.newlyUnlockedPartnerIds).toEqual(['MOBILITY']);
    expect(first.profile.equippedPartnerId).toBe('MOBILITY');
    const second = grantStarterPartnerOnProfile(first.profile);
    expect(second.newlyUnlockedPartnerIds).toEqual([]);
  });

  test('evolve deducts gold on unlocked partner', () => {
    let p = normalizeProfile({ version: 1 });
    p = grantStarterPartnerOnProfile(p).profile;
    p.gold = 50;
    p.partners.MOBILITY.level = 5;
    p = evolvePartnerOnProfile(p, 'MOBILITY');
    expect(p.partners.MOBILITY.evolutionStage).toBe(2);
    expect(p.gold).toBe(0);
  });

  test('equip rejects locked partner', () => {
    const p = normalizeProfile({ version: 1 });
    expect(() => equipPartnerOnProfile(p, 'GUARD')).toThrow(/未解锁/);
  });

  test('equip unlocked partner and allow null', () => {
    let p = grantStarterPartnerOnProfile(normalizeProfile({ version: 1 })).profile;
    p = applyPartnerUnlocksOnProfile(p, 3).profile;
    p = equipPartnerOnProfile(p, 'GUARD');
    expect(p.equippedPartnerId).toBe('GUARD');
    p = equipPartnerOnProfile(p, null);
    expect(p.equippedPartnerId).toBeNull();
  });

  test('unlockAllPartners opens all and keeps progressive + progress', () => {
    let p = normalizeProfile({ version: 1 });
    p = grantStarterPartnerOnProfile(p).profile;
    p.partners.MOBILITY.level = 8;
    p.partners.MOBILITY.evolutionStage = 2;
    p = unlockAllPartnersOnProfile(p);
    expect(p.partnerUnlockScheme).toBe('progressive');
    for (const id of ['MOBILITY', 'GUARD', 'BREAKER', 'CONTROL', 'ANIMA', 'HEAL']) {
      expect(p.partners[id].unlocked).toBe(true);
    }
    expect(p.partners.MOBILITY.level).toBe(8);
    expect(p.partners.MOBILITY.evolutionStage).toBe(2);
    expect(p.equippedPartnerId).toBe('MOBILITY');
  });

  test('unlockAllPartners then clear unlock is idempotent', () => {
    let p = unlockAllPartnersOnProfile(normalizeProfile({ version: 1 }));
    const { profile, newlyUnlockedPartnerIds } = applyPartnerUnlocksOnProfile(p, 17);
    expect(newlyUnlockedPartnerIds).toEqual([]);
    expect(profile.partners.ANIMA.unlocked).toBe(true);
    expect(profile.partnerUnlockScheme).toBe('progressive');
  });
});
