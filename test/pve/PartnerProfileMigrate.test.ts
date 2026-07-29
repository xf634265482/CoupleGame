import { normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

describe('PartnerProfileMigrate', () => {
  it('invalid equipped id falls back to null when MOBILITY locked', () => {
    const n = normalizePartners({ partners: {}, equippedPartnerId: 'NOPE' as 'MOBILITY' });
    expect(n.equippedPartnerId).toBeNull();
  });

  it('unlocked equipped id is kept', () => {
    const n = normalizePartners({
      partners: {
        MOBILITY: { unlocked: true, level: 1, exp: 0, evolutionStage: 1 },
      },
      equippedPartnerId: 'MOBILITY',
    });
    expect(n.equippedPartnerId).toBe('MOBILITY');
    expect(n.partnerUnlockScheme).toBe('legacy');
  });
});
