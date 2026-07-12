import { clearFloorRuntime, startFloorRuntime } from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import { activateSpiritBurst, calculateSpiritGain, gainSpirit, gainSpiritFromAttack } from '../../assets/scripts/pve/core/SpiritBurstSystem';
import { commitProfessionAttack, commitProfessionMove, endProfessionTurn, previewProfessionAttack } from '../../assets/scripts/pve/core/professions/ProfessionActionSystem';
import type { FloorChallengeSnapshot, PveProfessionId } from '../../assets/scripts/pve/core/PveProgressionTypes';

function runtime(professionId: PveProfessionId) {
  const snapshot: FloorChallengeSnapshot = { challengeId: `spirit-${professionId}`, userId: 'u1', floor: 1, mode: 'PROGRESSION', seed: 9, status: 'ACTIVE', config: { professionId, equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null }, startedAt: 1, updatedAt: 1 };
  return startFloorRuntime(snapshot, { maxHp: 280, maxAp: 8 }, {}, 1);
}
function full(professionId: PveProfessionId) { return { ...runtime(professionId), resources: { ...runtime(professionId).resources, spirit: 100 } }; }

describe('spirit burst', () => {
  test('gain formulas cap and full slot discards overflow', () => {
    expect(calculateSpiritGain({ type: 'ACTIVE_ATTACK_HIT', finalApCost: 20 }, 280)).toBe(14);
    expect(calculateSpiritGain({ type: 'PLAYER_DAMAGED', actualDamage: 56 }, 280)).toBe(10);
    const gained = gainSpirit({ ...runtime('WARRIOR'), resources: { ...runtime('WARRIOR').resources, spirit: 95 } }, { type: 'BOSS_PHASE', firstForPhase: true });
    expect(gained.resources.spirit).toBe(100);
  });

  test('multi-target attack gains hit spirit once and kill spirit for at most two targets', () => {
    const gained = gainSpiritFromAttack(runtime('WARRIOR'), { hit: true, finalApCost: 2, killedRanks: ['NORMAL', 'ELITE', 'CLIMAX'] });
    expect(gained.resources.spirit).toBe(31);
  });

  test('burst requires a full slot and cannot stack', () => {
    expect(() => activateSpiritBurst(runtime('WARRIOR'))).toThrow('SPIRIT_NOT_FULL');
    const active = activateSpiritBurst(full('WARRIOR'));
    expect(() => activateSpiritBurst({ ...active, resources: { ...active.resources, spirit: 100 } })).toThrow('SPIRIT_BURST_ALREADY_ACTIVE');
  });

  test('warrior formation break grants two free charge AP and penetration', () => {
    const active = activateSpiritBurst(full('WARRIOR'));
    const normal = previewProfessionAttack(active, { apCost: 2 }, 7, { professionId: 'WARRIOR', extraChargeAp: 0 });
    expect(normal).toMatchObject({ apCost: 2, consumesSpiritBurst: false });
    const charged = previewProfessionAttack(active, { apCost: 2 }, 7, { professionId: 'WARRIOR', extraChargeAp: 3 });
    expect(charged).toMatchObject({ apCost: 3, damageMultiplier: 1.8, armorPenetration: 0.2, consumesSpiritBurst: true });
    expect(commitProfessionAttack(active, charged).profession.spiritBurstActive).toBe(false);
  });

  test('archer focus guards one move, pierces cover, and ends on attack', () => {
    let active = activateSpiritBurst(full('ARCHER'));
    expect(active.profession.archerAimLevel).toBe(3);
    active = commitProfessionMove(active, 2);
    expect(active.profession.archerAimLevel).toBe(3);
    const shot = previewProfessionAttack(active, { apCost: 2, straightProjectile: true }, 7, { professionId: 'ARCHER' });
    expect(shot.ignoreFirstBreakableCover).toBe(true);
    expect(commitProfessionAttack(active, shot).profession.spiritBurstActive).toBe(false);
  });

  test('ranger seamless reduces four costs and permits only first repeated action in a streak', () => {
    let active = activateSpiritBurst(full('RANGER'));
    active = commitProfessionMove(active, 2);
    active = commitProfessionMove(active, 2);
    active = commitProfessionMove(active, 2);
    expect(active.resources.ap).toBe(5);
    expect(active.profession.rangerCombo).toBe(2);
    const attack = previewProfessionAttack(active, { apCost: 2 }, 7, { professionId: 'RANGER' });
    expect(attack.apCost).toBe(1);
    active = commitProfessionAttack(active, attack);
    expect(active.profession.rangerCombo).toBe(3);
    expect(active.profession.spiritBurstActive).toBe(false);
  });

  test('archer and ranger bursts expire at turn end; warrior persists one extra turn', () => {
    expect(endProfessionTurn(activateSpiritBurst(full('ARCHER')), 8).profession.spiritBurstActive).toBe(false);
    expect(endProfessionTurn(activateSpiritBurst(full('RANGER')), 8).profession.spiritBurstActive).toBe(false);
    const warriorNext = endProfessionTurn(activateSpiritBurst(full('WARRIOR')), 8);
    expect(warriorNext.profession.spiritBurstActive).toBe(true);
    expect(endProfessionTurn(warriorNext, 8).profession.spiritBurstActive).toBe(false);
  });

  test('floor clear discards stored spirit and active burst state', () => {
    const cleared = clearFloorRuntime(activateSpiritBurst(full('WARRIOR')));
    expect(cleared.resources.spirit).toBe(0);
    expect(cleared.profession.spiritBurstActive).toBe(false);
  });
});
