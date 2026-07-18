const { normalizeProfile } = require('../pve/PveProfile');
const { evolvePartnerOnProfile, equipPartnerOnProfile } = require('../pve/PvePartner');

describe('PvePartner', () => {
  test('normalize soft-fills partners', () => {
    const p = normalizeProfile({ version: 1, highestUnlockedFloor: 1, highestClearedFloor: 0 });
    expect(p.equippedPartnerId).toBe('MOBILITY');
    expect(p.partners.HEAL.unlocked).toBe(true);
  });

  test('evolve deducts gold', () => {
    let p = normalizeProfile({ version: 1 });
    p.gold = 50;
    p.partners.MOBILITY.level = 5;
    p = evolvePartnerOnProfile(p, 'MOBILITY');
    expect(p.partners.MOBILITY.evolutionStage).toBe(2);
    expect(p.gold).toBe(0);
  });

  test('equip partner', () => {
    let p = normalizeProfile({ version: 1 });
    p = equipPartnerOnProfile(p, 'GUARD');
    expect(p.equippedPartnerId).toBe('GUARD');
  });
});
