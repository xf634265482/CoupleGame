import { startFloorRuntime } from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import { commitProfessionAttack, commitProfessionMove, commitRangerFinisher, endProfessionTurn, previewProfessionAttack } from '../../assets/scripts/pve/core/professions/ProfessionActionSystem';
import type { FloorChallengeSnapshot, PveProfessionId } from '../../assets/scripts/pve/core/PveProgressionTypes';

function runtime(professionId: PveProfessionId) {
  const snapshot: FloorChallengeSnapshot = {
    challengeId: `challenge-${professionId}`, userId: 'test-user', floor: 1, mode: 'PROGRESSION', seed: 7, status: 'ACTIVE',
    config: { professionId, equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
    startedAt: 1, updatedAt: 1,
  };
  return startFloorRuntime(snapshot, { maxHp: 280, maxAp: 8 }, {}, 1);
}

describe('profession action integration', () => {
  const sameWeapon = { apCost: 2, knockback: 0, straightProjectile: true };

  test('same weapon keeps equipment cost while professions change action rules', () => {
    const warrior = previewProfessionAttack(runtime('WARRIOR'), sameWeapon, 7, { professionId: 'WARRIOR', extraChargeAp: 2 });
    const archer = previewProfessionAttack(endProfessionTurn(endProfessionTurn(endProfessionTurn(runtime('ARCHER'), 8), 8), 8), sameWeapon, 7, { professionId: 'ARCHER' });
    const ranger = previewProfessionAttack(runtime('RANGER'), sameWeapon, 7, { professionId: 'RANGER' });
    expect(warrior).toMatchObject({ apCost: 4, damageMultiplier: 1.75, chargeLevel: 2, collisionRatio: 0.4 });
    expect(archer).toMatchObject({ apCost: 2, damageMultiplier: 1.3, rangeBonus: 1 });
    expect(ranger).toMatchObject({ apCost: 2, damageMultiplier: 1 });
  });

  test('warrior commit consumes previewed AP and records actual extra charge', () => {
    const state = runtime('WARRIOR');
    const preview = previewProfessionAttack(state, sameWeapon, 7, { professionId: 'WARRIOR', extraChargeAp: 3 });
    const next = commitProfessionAttack(state, preview, 2);
    expect(next.resources.ap).toBe(3);
    expect(next.profession.warriorChargeLevel).toBe(3);
    expect(endProfessionTurn(next, 8).profession.warriorChargeLevel).toBe(0);
  });

  test('archer active movement lowers aim but forced movement does not', () => {
    const aimed = endProfessionTurn(endProfessionTurn(runtime('ARCHER'), 8), 8);
    expect(commitProfessionMove(aimed, 2).profession.archerAimLevel).toBe(1);
    expect(commitProfessionMove(aimed, 2, true).profession.archerAimLevel).toBe(2);
  });

  test('ranger action order builds combo and finisher remains player-triggered', () => {
    let state = runtime('RANGER');
    state = commitProfessionMove(state, 1);
    let attack = previewProfessionAttack(state, sameWeapon, 7, { professionId: 'RANGER' });
    state = commitProfessionAttack(state, attack);
    state = commitProfessionMove(state, 1);
    attack = previewProfessionAttack(state, sameWeapon, 7, { professionId: 'RANGER' });
    state = commitProfessionAttack(state, attack);
    expect(state.profession.rangerCombo).toBe(4);
    const finish = commitRangerFinisher(state, 'SHADOW_END', 3);
    expect(finish).toMatchObject({ valid: true, state: { profession: { rangerCombo: 0, rangerPendingAttackMultiplier: 1.6 } } });
  });

  test('ranger finisher at 3 combo arms quick damage and free move', () => {
    let state = runtime('RANGER');
    state = commitProfessionMove(state, 1);
    state = commitProfessionAttack(state, previewProfessionAttack(state, sameWeapon, 1, { professionId: 'RANGER' }));
    state = commitProfessionMove(state, 1);
    expect(state.profession.rangerCombo).toBe(3);
    const damage = commitRangerFinisher(state, 'QUICK_DAMAGE', 1);
    expect(damage).toMatchObject({ valid: true, state: { profession: { rangerCombo: 0, rangerPendingAttackMultiplier: 1.25, rangerFreeMoveSteps: 0 } } });
    const move = commitRangerFinisher(state, 'QUICK_MOVE', 1);
    expect(move).toMatchObject({ valid: true, freeMoveRange: 1, state: { profession: { rangerFreeMoveSteps: 1 } } });
  });

  test('invalid preview cannot be committed', () => {
    const state = runtime('WARRIOR');
    const invalid = previewProfessionAttack(state, sameWeapon, 7, { professionId: 'WARRIOR', extraChargeAp: 9 });
    expect(() => commitProfessionAttack(state, invalid)).toThrow('INVALID_PROFESSION_ATTACK_COMMIT');
  });
});
