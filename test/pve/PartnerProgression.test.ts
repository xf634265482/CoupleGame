import {
  createDefaultPartners,
  grantPartnerExp,
  canEvolve,
  evolvePartner,
  partnerClearExp,
  xpRequiredForLevel,
} from '../../assets/scripts/pve/core/partner/PartnerProgression';
import { normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import { hasCompletedPartnerTrial } from '../../assets/scripts/pve/core/partner/PartnerTrial';
import type { PlayerPartnerProgress } from '../../assets/scripts/pve/core/partner/PartnerTypes';

describe('PartnerProgression', () => {
  it('defaults lock all six with null equipped', () => {
    const { partners, equippedPartnerId } = createDefaultPartners();
    expect(Object.keys(partners).sort()).toEqual(
      ['ANIMA', 'BREAKER', 'CONTROL', 'GUARD', 'HEAL', 'MOBILITY'].sort(),
    );
    expect(equippedPartnerId).toBeNull();
    expect(partners.MOBILITY).toEqual({ unlocked: false, level: 1, exp: 0, evolutionStage: 1 });
  });

  it('normalize fills missing partners without wiping existing', () => {
    const n = normalizePartners({
      partners: { MOBILITY: { unlocked: true, level: 4, exp: 10, evolutionStage: 1 } },
      equippedPartnerId: 'MOBILITY',
    });
    expect(n.partners.MOBILITY.level).toBe(4);
    expect(n.partners.HEAL.unlocked).toBe(false);
    expect(n.equippedPartnerId).toBe('MOBILITY');
  });

  it('grants clear exp and levels up', () => {
    let p: PlayerPartnerProgress = { unlocked: true, level: 1, exp: 0, evolutionStage: 1 };
    const need = xpRequiredForLevel(1);
    p = grantPartnerExp(p, need);
    expect(p.level).toBe(2);
    expect(p.exp).toBe(0);
    expect(partnerClearExp(3)).toBe(33);
  });

  it('evolves 1→2 at Lv5 costing 50 stardust', () => {
    const p: PlayerPartnerProgress = { unlocked: true, level: 5, exp: 0, evolutionStage: 1 };
    expect(canEvolve(p, 50).ok).toBe(true);
    const r = evolvePartner(p, 50);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.progress.evolutionStage).toBe(2);
      expect(r.gold).toBe(0);
    }
  });

  it('trial stub always true', () => {
    expect(hasCompletedPartnerTrial('BREAKER', 3)).toBe(true);
  });
});
