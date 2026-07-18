import { createMinghenTriggerMemory, resolveMinghenEffects } from '../../assets/scripts/pve/core/minghen/MinghenEffects';
import type { MinghenEventContext } from '../../assets/scripts/pve/core/minghen/MinghenEventContext';

function ctx(overrides: Partial<MinghenEventContext>): MinghenEventContext {
  return { eventId: 'e1', hook: 'BEFORE_HIT', turn: 1, source: 'ACTIVE_ACTION', ...overrides };
}

describe('Minghen V3 adjusted effects', () => {
  test('M08 III grants shield instead of terrain copy', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M08', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'AFTER_MOVE', enteredDangerousTerrain: true }), memory);
    const hit = resolveMinghenEffects(loadout, ctx({ eventId: 'h', hook: 'BEFORE_HIT', maxHp: 200 }), memory);
    expect(hit.damageMultiplierBonus).toBeCloseTo(0.25);
    expect(hit.flags).not.toContain('COPY_TERRAIN');
    const after = resolveMinghenEffects(loadout, ctx({ eventId: 'ah', hook: 'AFTER_HIT', maxHp: 200 }), memory);
    expect(after.shield).toBeCloseTo(12);
  });

  test('M22 breakout discounts first move when surrounded', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M22', level: 1 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 's', hook: 'TURN_START', adjacentEnemyCount: 2 }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE' }), memory).moveCostReduction).toBe(1);
  });

  test('M22 III grants attack buff after breaking free', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M22', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 's', hook: 'TURN_START', adjacentEnemyCount: 2 }), memory);
    resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE' }), memory);
    resolveMinghenEffects(loadout, ctx({ eventId: 'am', hook: 'AFTER_MOVE', adjacentEnemyCount: 0, maxHp: 100 }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'h', hook: 'BEFORE_HIT' }), memory).damageMultiplierBonus).toBeCloseTo(0.15);
  });

  test('M25 III bonus from extra-move terrain once per turn', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M25', level: 3 as const }];
    const hit = resolveMinghenEffects(loadout, ctx({
      eventId: 'h', hook: 'BEFORE_HIT', onExtraMoveCostTerrain: true,
    }), memory);
    expect(hit.damageMultiplierBonus).toBeCloseTo(0.15);
    expect(resolveMinghenEffects(loadout, ctx({
      eventId: 'h2', hook: 'BEFORE_HIT', onExtraMoveCostTerrain: true,
    }), memory).damageMultiplierBonus).toBe(0);
  });

  test('M26 stores ready on environment damage without double heal', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M26', level: 3 as const }];
    const damaged = resolveMinghenEffects(loadout, ctx({
      eventId: 'd', hook: 'DAMAGED', source: 'ENVIRONMENT', environmentDamage: 20, maxHp: 100,
    }), memory);
    expect(damaged.heal).toBe(0);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'h', hook: 'BEFORE_HIT' }), memory).damageMultiplierBonus).toBeCloseTo(0.2);
  });

  test('M27 adds stack on single-status reapply', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M27', level: 1 as const }];
    const applied = resolveMinghenEffects(loadout, ctx({
      eventId: 'sa', hook: 'STATUS_APPLIED', appliedStatus: 'POISON', targetId: 't1',
      targetStatuses: ['POISON'],
    }), memory);
    expect(applied.applyStatuses).toEqual([{ id: 'POISON', stacks: 1 }]);
  });

  test('M28 converts burn and chill with secondary damage', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M28', level: 3 as const }];
    const applied = resolveMinghenEffects(loadout, ctx({
      eventId: 'sa', hook: 'STATUS_APPLIED', appliedStatus: 'BURN', targetId: 't1',
      targetStatuses: ['CHILL'],
    }), memory);
    expect(applied.flags).toContain('CONVERT_BURN_CHILL');
    expect(applied.secondaryDamageRatio).toBeCloseTo(0.5);
  });

  test('M29 flags extra poison on bleed move', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M29', level: 1 as const }];
    const moved = resolveMinghenEffects(loadout, ctx({
      eventId: 'mv', hook: 'AFTER_MOVE', targetId: 't1', bleedTriggeredByMove: true,
      targetStatuses: ['BLEED', 'POISON'],
    }), memory);
    expect(moved.flags).toContain('EXTRA_POISON_ON_BLEED_MOVE');
  });

  test('M30 stores aftermath and applies to different target', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M30', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({
      eventId: 'k', hook: 'KILL', targetId: 'dead', targetHasStatus: true, targetStatuses: ['POISON'],
    }), memory);
    const hit = resolveMinghenEffects(loadout, ctx({
      eventId: 'h', hook: 'BEFORE_HIT', targetId: 'other',
    }), memory);
    expect(hit.applyStatuses).toEqual([{ id: 'POISON', stacks: 2 }]);
    expect(hit.damageMultiplierBonus).toBeCloseTo(0.15);
  });

  test('M31 grants shield on entering task zone', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M31', level: 1 as const }];
    const moved = resolveMinghenEffects(loadout, ctx({
      eventId: 'm', hook: 'AFTER_MOVE', inTaskObjectiveZone: true, maxHp: 100,
    }), memory);
    expect(moved.shield).toBeCloseTo(5);
  });

  test('M32 grants pending shield after undamaged turn', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M32', level: 2 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'end', hook: 'TURN_END', damagedThisTurn: false }), memory);
    const start = resolveMinghenEffects(loadout, ctx({ eventId: 'start', hook: 'TURN_START', maxHp: 100 }), memory);
    expect(start.shield).toBeCloseTo(6);
  });

  test('M33 spirit on first active kill per turn', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M33', level: 2 as const }];
    const kill = resolveMinghenEffects(loadout, ctx({ eventId: 'k', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory);
    expect(kill.spiritGain).toBe(8);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'k2', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory).spiritGain).toBe(0);
  });

  test('M34 spends shield into secondary damage on heavy attack', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M34', level: 1 as const }];
    const r = resolveMinghenEffects(loadout, ctx({
      eventId: 'a', hook: 'BEFORE_ATTACK', apCost: 3, shield: 20, maxHp: 100,
    }), memory);
    expect(r.consumeShieldRatioOfMaxHp).toBe(0.05);
    expect(r.shieldToDamageRatio).toBe(1.5);
  });

  test('M35 stores buff when shield threshold met at turn end', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M35', level: 1 as const }];
    resolveMinghenEffects(loadout, ctx({
      eventId: 'end', hook: 'TURN_END', maxHp: 100, shield: 10, shieldBrokenThisTurn: false,
    }), memory);
    resolveMinghenEffects(loadout, ctx({ eventId: 'start', hook: 'TURN_START', turn: 2 }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE', turn: 2 }), memory).moveCostReduction).toBe(1);
  });

  test('M36 shield scales with effective healing at low hp', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M36', level: 2 as const }];
    const healed = resolveMinghenEffects(loadout, ctx({
      eventId: 'heal', hook: 'HEALED', hp: 30, maxHp: 100, effectiveHealing: 20,
    }), memory);
    expect(healed.shield).toBeCloseTo(12);
  });

  test('M37 stop-loss only reduces overflow above 20% maxHp', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M37', level: 1 as const }];
    const r = resolveMinghenEffects(loadout, ctx({
      eventId: 'd', hook: 'DAMAGED', maxHp: 100, actualDamage: 40, source: 'ENEMY',
    }), memory);
    expect(r.overflowDamageReductionRatio).toBe(0.3);
  });

  test('M38 stores move discount across turns at level 2', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M38', level: 2 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'k', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory);
    resolveMinghenEffects(loadout, ctx({ eventId: 'end', hook: 'TURN_END', turn: 1 }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE', turn: 2 }), memory).moveCostReduction).toBe(1);
  });

  test('M38 III grants shield after discounted move', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M38', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'k', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory);
    resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE' }), memory);
    const moved = resolveMinghenEffects(loadout, ctx({ eventId: 'am', hook: 'AFTER_MOVE', maxHp: 100 }), memory);
    expect(moved.shield).toBeCloseTo(5);
  });
});
