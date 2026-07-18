import { normalizePartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

describe('PartnerProfileMigrate', () => {
  it('invalid equipped id falls back to MOBILITY', () => {
    const n = normalizePartners({ partners: {}, equippedPartnerId: 'NOPE' as 'MOBILITY' });
    expect(n.equippedPartnerId).toBe('MOBILITY');
  });
});
