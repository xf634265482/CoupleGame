import {
  applyPartnerUnlocks,
  grantStarterPartner,
  partnerUnlockHint,
  createLockedPartnersMap,
} from '../../assets/scripts/pve/core/partner/PartnerUnlock';
import { createDefaultPartners, normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import { PARTNER_IDS } from '../../assets/scripts/pve/core/partner/PartnerTypes';

describe('PartnerUnlock', () => {
  it('defaults to all locked with null equipped', () => {
    const d = createDefaultPartners();
    expect(d.partnerUnlockScheme).toBe('progressive');
    expect(d.equippedPartnerId).toBeNull();
    for (const id of PARTNER_IDS) {
      expect(d.partners[id].unlocked).toBe(false);
    }
  });

  it('unlocks GUARD/HEAL/BREAKER when clearing floor 7', () => {
    const { partners, newlyUnlockedPartnerIds } = applyPartnerUnlocks(createLockedPartnersMap(), 7);
    expect(newlyUnlockedPartnerIds).toEqual(['GUARD', 'BREAKER', 'HEAL']);
    expect(partners.GUARD.unlocked).toBe(true);
    expect(partners.HEAL.unlocked).toBe(true);
    expect(partners.BREAKER.unlocked).toBe(true);
    expect(partners.CONTROL.unlocked).toBe(false);
    expect(partners.ANIMA.unlocked).toBe(false);
    expect(partners.MOBILITY.unlocked).toBe(false);
  });

  it('grantStarterPartner is idempotent and equips MOBILITY', () => {
    const first = grantStarterPartner(createLockedPartnersMap(), null);
    expect(first.newlyUnlockedPartnerIds).toEqual(['MOBILITY']);
    expect(first.equippedPartnerId).toBe('MOBILITY');
    expect(first.partners.MOBILITY.unlocked).toBe(true);
    const second = grantStarterPartner(first.partners, first.equippedPartnerId);
    expect(second.newlyUnlockedPartnerIds).toEqual([]);
    expect(second.equippedPartnerId).toBe('MOBILITY');
  });

  it('partnerUnlockHint covers tutorial and floor gates', () => {
    expect(partnerUnlockHint('MOBILITY')).toContain('教程');
    expect(partnerUnlockHint('GUARD')).toContain('3');
    expect(partnerUnlockHint('ANIMA')).toContain('17');
  });

  it('normalize keeps legacy unlocks and does not force MOBILITY when locked', () => {
    const legacy = normalizePartners({
      partners: {
        MOBILITY: { unlocked: true, level: 2, exp: 0, evolutionStage: 1 },
        GUARD: { unlocked: true, level: 1, exp: 0, evolutionStage: 1 },
      },
      equippedPartnerId: 'GUARD',
    });
    expect(legacy.partnerUnlockScheme).toBe('legacy');
    expect(legacy.partners.MOBILITY.unlocked).toBe(true);
    expect(legacy.partners.GUARD.unlocked).toBe(true);
    expect(legacy.equippedPartnerId).toBe('GUARD');

    const fresh = normalizePartners({ partners: {}, equippedPartnerId: 'MOBILITY' });
    expect(fresh.partnerUnlockScheme).toBe('progressive');
    expect(fresh.equippedPartnerId).toBeNull();
    expect(fresh.partners.MOBILITY.unlocked).toBe(false);
  });

  it('missing partners with cleared progress becomes legacy all-unlocked', () => {
    const n = normalizePartners({ highestClearedFloor: 10 });
    expect(n.partnerUnlockScheme).toBe('legacy');
    expect(n.partners.ANIMA.unlocked).toBe(true);
  });
});
