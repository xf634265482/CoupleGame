import {
  IMPLICIT_SHOES_IRON,
  IMPLICIT_SHOES_LIGHT,
  IMPLICIT_SHOES_WAR,
  getClassicEquipmentTemplate,
  resolveShoesStageEffects,
} from '../../assets/scripts/pve/core/EquipmentSystem';

describe('resolveShoesStageEffects', () => {
  it('COMMON/FINE: no branch effects for all types', () => {
    for (const q of ['COMMON', 'FINE'] as const) {
      for (const t of [IMPLICIT_SHOES_LIGHT, IMPLICIT_SHOES_WAR, IMPLICIT_SHOES_IRON]) {
        const e = resolveShoesStageEffects(t, q);
        expect(e.moveCostReduction).toBe(0);
        expect(e.fogBonus).toBe(0);
        expect(e.firstMoveFree).toBe(false);
        expect(e.stealthReduction).toBe(0);
        expect(e.terrainDamageReduction).toBe(0);
        expect(e.firstMoveApPenalty).toBe(0);
      }
    }
  });

  it('light RARE/EPIC/LEGENDARY ladder', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'RARE')).toMatchObject({
      moveCostReduction: 1,
      fogBonus: 1,
      stealthReduction: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'EPIC').stealthReduction).toBe(2);
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'LEGENDARY').stealthReduction).toBe(3);
  });

  it('war RARE first free; EPIC adds move reduction', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_WAR, 'RARE')).toMatchObject({
      firstMoveFree: true,
      moveCostReduction: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_WAR, 'EPIC')).toMatchObject({
      firstMoveFree: true,
      moveCostReduction: 1,
    });
  });

  it('iron RARE terrain; EPIC+ first-move penalty', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'RARE')).toMatchObject({
      terrainDamageReduction: 1,
      firstMoveApPenalty: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'EPIC')).toMatchObject({
      terrainDamageReduction: 1,
      firstMoveApPenalty: 1,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'LEGENDARY').terrainDamageReduction).toBe(2);
  });
});

describe('SHOES catalog mapping', () => {
  it('maps existing names to types and HP ranges', () => {
    expect(getClassicEquipmentTemplate('布靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_LIGHT,
      baseStatMin: 10,
      baseStatMax: 14,
    });
    expect(getClassicEquipmentTemplate('皮靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_WAR,
      baseStatMin: 12,
      baseStatMax: 16,
    });
    expect(getClassicEquipmentTemplate('沙地靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_IRON,
      baseStatMin: 15,
      baseStatMax: 20,
    });
    expect(getClassicEquipmentTemplate('疾风之靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_WAR,
      baseStatMin: 95,
      baseStatMax: 115,
    });
    expect(getClassicEquipmentTemplate('影踪战靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_LIGHT,
      baseStatMin: 80,
      baseStatMax: 100,
    });
    expect(getClassicEquipmentTemplate('猎风铁靴')).toMatchObject({
      implicit: IMPLICIT_SHOES_IRON,
      baseStatMin: 78,
      baseStatMax: 94,
    });
  });
});
