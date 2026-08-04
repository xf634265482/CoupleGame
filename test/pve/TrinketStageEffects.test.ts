import {
  IMPLICIT_TRINKET_GOLD,
  IMPLICIT_TRINKET_LUCK,
  IMPLICIT_TRINKET_SPIRIT,
  getClassicEquipmentTemplate,
  resolveTrinketStageEffects,
} from '../../assets/scripts/pve/core/EquipmentSystem';

describe('resolveTrinketStageEffects', () => {
  it('COMMON/FINE: no branch effects', () => {
    for (const q of ['COMMON', 'FINE'] as const) {
      for (const t of [IMPLICIT_TRINKET_SPIRIT, IMPLICIT_TRINKET_LUCK, IMPLICIT_TRINKET_GOLD]) {
        const e = resolveTrinketStageEffects(t, q);
        expect(e.killSpiritFlat).toBe(0);
        expect(e.spiritBurstHeal).toBe(0);
        expect(e.critChance).toBe(0);
        expect(e.stardustBonusRatio).toBe(0);
      }
    }
  });

  it('spirit ladder', () => {
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_SPIRIT, 'RARE')).toMatchObject({
      killSpiritFlat: 5,
      spiritBurstHeal: 0,
    });
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_SPIRIT, 'EPIC')).toMatchObject({
      killSpiritFlat: 8,
      spiritBurstHeal: 8,
    });
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_SPIRIT, 'LEGENDARY')).toMatchObject({
      killSpiritFlat: 10,
      spiritBurstHeal: 12,
    });
  });

  it('luck crit ladder', () => {
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_LUCK, 'RARE').critChance).toBe(0.05);
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_LUCK, 'EPIC').critChance).toBe(0.10);
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_LUCK, 'LEGENDARY').critChance).toBe(0.12);
  });

  it('gold stardust ladder', () => {
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_GOLD, 'RARE').stardustBonusRatio).toBe(0.15);
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_GOLD, 'EPIC').stardustBonusRatio).toBe(0.25);
    expect(resolveTrinketStageEffects(IMPLICIT_TRINKET_GOLD, 'LEGENDARY').stardustBonusRatio).toBe(0.30);
  });
});

describe('TRINKET catalog mapping', () => {
  it('maps names to types and spirit % ranges', () => {
    expect(getClassicEquipmentTemplate('灵力宝珠')).toMatchObject({
      implicit: IMPLICIT_TRINKET_SPIRIT,
      baseStatMin: 5,
      baseStatMax: 9,
    });
    expect(getClassicEquipmentTemplate('幸运铜币')).toMatchObject({
      implicit: IMPLICIT_TRINKET_LUCK,
      baseStatMin: 3,
      baseStatMax: 7,
    });
    expect(getClassicEquipmentTemplate('财运符')).toMatchObject({
      implicit: IMPLICIT_TRINKET_GOLD,
      baseStatMin: 2,
      baseStatMax: 6,
    });
    expect(getClassicEquipmentTemplate('聚财宝石')?.implicit).toBe(IMPLICIT_TRINKET_GOLD);
    expect(getClassicEquipmentTemplate('命运护符')?.implicit).toBe(IMPLICIT_TRINKET_SPIRIT);
    expect(getClassicEquipmentTemplate('幸运女神眼')?.implicit).toBe(IMPLICIT_TRINKET_LUCK);
  });
});
