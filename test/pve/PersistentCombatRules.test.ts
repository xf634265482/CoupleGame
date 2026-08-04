import { applyPersistentAttack, previewPersistentAttack } from '../../assets/scripts/pve/core/PersistentCombatRules';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import { activateSpiritBurst } from '../../assets/scripts/pve/core/SpiritBurstSystem';
import type { FloorChallengeSnapshot, PveProfile, PveProfessionId } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(professionId: PveProfessionId): PveProfile {
  return {
    version: 1, highestUnlockedFloor: 2, highestClearedFloor: 1, floorRecords: {},
    minghenCollection: {}, minghenLoadout: [], minghenPresets: [], equipmentInventory: [], equipmentLoadout: {},
    gold: 0, minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 7, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 7, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 7, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: professionId, tracking: null, activeChallengeId: 'c', updatedAt: 1,
  };
}

function runtime(professionId: PveProfessionId, minghenLoadout: FloorChallengeSnapshot['config']['minghenLoadout'] = []) {
  const challenge: FloorChallengeSnapshot = {
    challengeId: 'c', userId: 'u', floor: 2, mode: 'PROGRESSION', seed: 22, status: 'ACTIVE',
    config: { professionId, equipmentLoadout: {}, minghenLoadout, trackedMinghenId: null },
    startedAt: 1, updatedAt: 1,
  };
  const value = createPersistentFloorRuntime(challenge, profile(professionId), undefined, 1);
  const target = value.battleState.expedition.floorState.monsters[0]!;
  const expedition = {
    ...value.battleState.expedition,
    floorState: {
      ...value.battleState.expedition.floorState,
      player: { x: target.pos.x, y: target.pos.y + 1 },
      ap: 12,
      maxAp: 12,
      revealed: value.battleState.expedition.floorState.revealed.map((row) => row.map(() => true)),
    },
  };
  return {
    profile: profile(professionId),
    targetId: target.id,
    runtime: { ...value, resources: { ...value.resources, ap: 12, maxAp: 12 }, battleState: { ...value.battleState, expedition } },
  };
}

describe('fixed equipment and profession injection into original attack', () => {
  test('uses UNARMED fixed AP while preserving original ATTACK event', () => {
    const setup = runtime('RANGER');
    const applied = applyPersistentAttack(setup.runtime, setup.targetId, setup.profile);
    expect(applied.result.state.floorState.ap).toBe(10);
    expect(applied.result.events.some((event) => event.type === 'ATTACK')).toBe(true);
    expect(applied.runtime.profession.rangerLastAction).toBe('ATTACK');
  });

  test('warrior charge increases cost and damage through optional context', () => {
    const setup = runtime('WARRIOR');
    const normalPreview = previewPersistentAttack(setup.runtime, setup.profile, 0);
    const chargePreview = previewPersistentAttack(setup.runtime, setup.profile, 3);
    expect(normalPreview.profession.apCost).toBe(2);
    expect(chargePreview.profession.apCost).toBe(5);
    expect(chargePreview.profession.damageMultiplier).toBeGreaterThan(normalPreview.profession.damageMultiplier);
  });

  test('warrior spirit burst gives an uncharged next attack one charge level and consumes once', () => {
    const setup = runtime('WARRIOR');
    const fullSpirit = { ...setup.runtime, resources: { ...setup.runtime.resources, spirit: 100 } };
    const burst = activateSpiritBurst(fullSpirit, 2);
    const normalCharge = previewPersistentAttack(setup.runtime, setup.profile, 1);
    const burstPreview = previewPersistentAttack(burst, setup.profile, 0);

    expect(burstPreview.profession.chargeLevel).toBe(1);
    expect(burstPreview.profession.damageMultiplier).toBe(normalCharge.profession.damageMultiplier);
    expect(burstPreview.profession.apCost).toBeLessThanOrEqual(normalCharge.profession.apCost);
    expect(burstPreview.profession.armorPenetration).toBeGreaterThan(normalCharge.profession.armorPenetration);

    const applied = applyPersistentAttack(burst, setup.targetId, setup.profile, 0);
    expect(applied.runtime.profession.spiritBurstActive).toBe(false);
  });

  test('warrior spirit burst preserves a manually selected higher charge', () => {
    const setup = runtime('WARRIOR');
    const burst = activateSpiritBurst({
      ...setup.runtime,
      resources: { ...setup.runtime.resources, spirit: 100 },
    }, 2);

    expect(previewPersistentAttack(burst, setup.profile, 3).profession.chargeLevel).toBe(3);
  });

  test('applies Minghen pre-hit multiplier without replacing original attack events', () => {
    const baseline = runtime('RANGER');
    const empowered = runtime('RANGER', [{ id: 'M05', level: 1 }]);
    empowered.runtime.battleState.minghenMemory.states.push('M05_READY');
    const baseResult = applyPersistentAttack(baseline.runtime, baseline.targetId, baseline.profile);
    const boostedResult = applyPersistentAttack(empowered.runtime, empowered.targetId, empowered.profile);
    const baseAttack = baseResult.result.events.find((event): event is Extract<(typeof baseResult.result.events)[number], { type: 'ATTACK' }> => event.type === 'ATTACK' && event.attackerId === 'PLAYER');
    const boostedAttack = boostedResult.result.events.find((event): event is Extract<(typeof boostedResult.result.events)[number], { type: 'ATTACK' }> => event.type === 'ATTACK' && event.attackerId === 'PLAYER');
    expect(boostedAttack?.damage).toBeGreaterThan(baseAttack?.damage ?? 0);
    expect(boostedResult.result.events.some((event) => event.type === 'ATTACK')).toBe(true);
  });

  test('applies Minghen status after a successful original attack', () => {
    const setup = runtime('WARRIOR', [{ id: 'M03', level: 2 }]);
    const applied = applyPersistentAttack(setup.runtime, setup.targetId, setup.profile, 1);
    const target = applied.result.state.floorState.monsters.find((entry) => entry.id === setup.targetId);
    expect(target?.burnRounds).toBeGreaterThanOrEqual(1);
    expect(applied.result.events.some((event) => event.type === 'ATTACK')).toBe(true);
  });
});
