import { previewWarriorAttack, resolveWarriorKnockback } from '../../assets/scripts/pve/core/professions/WarriorSystem';
import { createArcherState, endArcherTurn, onArcherMove, previewArcherAttack } from '../../assets/scripts/pve/core/professions/ArcherSystem';
import { createRangerState, endRangerTurn, recordRangerAction, useRangerFinisher } from '../../assets/scripts/pve/core/professions/RangerSystem';
import { floorXp, masteryLevelForXp, unlockedTechniques } from '../../assets/scripts/pve/core/professions/ProfessionMastery';

describe('profession core rules', () => {
  test('warrior charge validates AP and technique requirements', () => {
    expect(previewWarriorAttack({ availableAp: 4, weaponApCost: 2, extraChargeAp: 3, masteryLevel: 7 }).reason).toBe('AP_NOT_ENOUGH');
    expect(previewWarriorAttack({ availableAp: 8, weaponApCost: 2, extraChargeAp: 1, masteryLevel: 7, technique: 'ARMOR_BREAK' }).reason).toBe('CHARGE_NOT_ENOUGH');
    expect(previewWarriorAttack({ availableAp: 8, weaponApCost: 2, extraChargeAp: 3, masteryLevel: 3, technique: 'ARMOR_BREAK' })).toMatchObject({ valid: true, damageMultiplier: 1.65, armorPenetration: 0.45 });
  });

  test('warrior boss converts knockback into stagger', () => {
    expect(resolveWarriorKnockback(3, 1, false)).toEqual({ moved: 1, stagger: 0 });
    expect(resolveWarriorKnockback(3, 9, true)).toEqual({ moved: 0, stagger: 3 });
  });

  test('archer gains aim when stationary and loses it only on active movement', () => {
    const aimed = endArcherTurn(createArcherState(2));
    expect(aimed.aimLevel).toBe(3);
    expect(onArcherMove(aimed).aimLevel).toBe(2);
    expect(onArcherMove(aimed, true).aimLevel).toBe(3);
  });

  test('archer techniques retain weapon AP and shape constraints', () => {
    expect(previewArcherAttack({ aimLevel: 2, masteryLevel: 3, technique: 'PIERCING', weaponApCost: 2, availableAp: 8 }).reason).toBe('AIM_OR_SHAPE_INVALID');
    expect(previewArcherAttack({ aimLevel: 3, masteryLevel: 5, technique: 'WEAK_POINT', weaponApCost: 2, availableAp: 3 })).toMatchObject({ valid: true, apCost: 3, damageMultiplier: 1.65 });
  });

  test('ranger combo rewards alternating actions without auto actions', () => {
    let state = createRangerState();
    state = recordRangerAction(state, 'MOVE');
    state = recordRangerAction(state, 'MOVE');
    state = recordRangerAction(state, 'ATTACK');
    state = recordRangerAction(state, 'MOVE');
    expect(state.combo).toBe(3);
    expect(useRangerFinisher(state, 'QUICK_MOVE', 1)).toMatchObject({ valid: true, freeMoveRange: 1 });
    expect(endRangerTurn().combo).toBe(0);
  });

  test('ranger advanced finishers require mastery and combo', () => {
    const state = { ...createRangerState(), combo: 4 };
    expect(useRangerFinisher(state, 'SHADOW_END', 2).reason).toBe('TECHNIQUE_LOCKED');
    expect(useRangerFinisher(state, 'SHADOW_END', 3)).toMatchObject({ valid: true, state: { pendingAttackMultiplier: 1.6, pendingArmorPenetration: 0.2 } });
  });

  test('mastery unlocks techniques but does not expose stat bonuses', () => {
    expect(masteryLevelForXp(900)).toBe(5);
    expect(unlockedTechniques('WARRIOR', 5)).toEqual(['ARMOR_BREAK', 'KNOCKBACK']);
    expect(floorXp(1, false, 8)).toBe(2);
  });
});
