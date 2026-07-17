import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { getFixedEquipmentDefinition } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
import { makeExpeditionState, makeMonster } from './helpers';

describe('warrior charge slam', () => {
  test('collision hits emit ATTACK cause=COLLISION instead of looking like a second direct shot', () => {
    const definition = getFixedEquipmentDefinition('生锈短刃');
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [
          makeMonster('front', { x: 4, y: 5 }, { hp: 80, maxHp: 80 }),
          makeMonster('back', { x: 4, y: 6 }, { hp: 80, maxHp: 80 }),
        ],
      },
      playerOverrides: {
        classId: 'BERSERKER',
        equipment: {
          WEAPON: {
            id: 'w',
            slot: 'WEAPON',
            quality: 'COMMON',
            name: '生锈短刃',
            baseStat: 6,
            enhanceLevel: 0,
          },
        },
      },
    });

    const result = playerAttack(state, 'front', {
      definition,
      profession: {
        valid: true,
        apCost: 6,
        damageMultiplier: 2.1,
        armorPenetration: 0,
        rangeBonus: 0,
        knockback: 2,
        collisionRatio: 0.55,
        secondaryMultiplier: 0,
        suppression: false,
        chargeLevel: 3,
        ignoreFirstBreakableCover: false,
        consumesSpiritBurst: false,
      },
    });

    const attacks = result.events.filter((e) => e.type === 'ATTACK') as Array<{
      targetId: string;
      cause?: string;
    }>;
    expect(attacks[0]).toMatchObject({ targetId: 'front' });
    expect(attacks[0]?.cause).toBeUndefined();
    const collisions = attacks.filter((e) => e.cause === 'COLLISION');
    expect(collisions.map((e) => e.targetId).sort()).toEqual(['back', 'front']);
    expect((result.state.floorState.monsters.find((m) => m.id === 'back')?.hp ?? 80) < 80).toBe(true);
    expect((result.state.floorState.monsters.find((m) => m.id === 'front')?.hp ?? 80) < 80).toBe(true);
  });
});
