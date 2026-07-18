import { createMinghenTriggerMemory, pruneMinghenMemory, resolveMinghenEffects } from '../../assets/scripts/pve/core/minghen/MinghenEffects';
import { emptyMinghenEffectResult, MINGHEN_HOOKS, type MinghenEventContext } from '../../assets/scripts/pve/core/minghen/MinghenEventContext';

function ctx(overrides: Partial<MinghenEventContext>): MinghenEventContext {
  return { eventId: 'e1', hook: 'BEFORE_HIT', turn: 1, source: 'ACTIVE_ACTION', ...overrides };
}
describe('Minghen effects', () => {
  test('effect result defaults include V3 mitigation fields', () => {
    const r = emptyMinghenEffectResult();
    expect(r.damageReductionRatio).toBe(0);
    expect(r.forcedDisplaceReduction).toBe(0);
    expect(r.transferDamageRatio).toBe(0);
    expect(r.transferMaxTargets).toBe(0);
    expect(r.consumeShieldRatioOfMaxHp).toBe(0);
    expect(r.shieldToDamageRatio).toBe(0);
    expect(r.refundConsumedShieldRatio).toBe(0);
    expect(r.overflowDamageReductionRatio).toBe(0);
  });
  test('hooks include TASK_INTERACT', () => {
    expect(MINGHEN_HOOKS).toContain('TASK_INTERACT');
  });

  test('same event resolves once and secondary Minghen damage cannot recurse', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M03', level: 2 as const }];
    expect(resolveMinghenEffects(loadout, ctx({ hook: 'AFTER_HIT', apCost: 3 }), memory).applyStatuses).toEqual([{ id: 'BURN', stacks: 1 }]);
    expect(resolveMinghenEffects(loadout, ctx({ hook: 'AFTER_HIT', apCost: 3 }), memory).applyStatuses).toEqual([]);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'e2', hook: 'AFTER_HIT', apCost: 3, source: 'MINGHEN_SECONDARY' }), memory).applyStatuses).toEqual([]);
  });
  test('stored prerequisites must occur before payoff', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M07', level: 2 as const }];
    expect(resolveMinghenEffects(loadout, ctx({}), memory).damageMultiplierBonus).toBe(0);
    resolveMinghenEffects(loadout, ctx({ eventId: 'hurt', hook: 'DAMAGED', actualDamage: 60, maxHp: 280, source: 'ENEMY' }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'hit' }), memory).damageMultiplierBonus).toBe(0.3);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'hit2' }), memory).damageMultiplierBonus).toBe(0);
  });
  test('effect resolution does not accept or inspect profession id', () => {
    const result = resolveMinghenEffects([{ id: 'M04', level: 2 }], ctx({ hook: 'AFTER_HIT', movedThisTurn: false }), createMinghenTriggerMemory());
    expect(result.applyStatuses).toEqual([{ id: 'CHILL', stacks: 2 }]);
  });
  test('global AP refund guard caps combined direct discount at one', () => {
    const memory = createMinghenTriggerMemory();
    resolveMinghenEffects([{ id: 'M13', level: 3 }], ctx({ eventId: 'collision', hook: 'COLLISION', collision: true, maxHp: 280 }), memory);
    const result = resolveMinghenEffects([{ id: 'M13', level: 3 }, { id: 'M22', level: 2 }], ctx({ eventId: 'attack', hook: 'BEFORE_ATTACK', lastAction: 'MOVE', action: 'ATTACK' }), memory);
    expect(result.apDelta).toBe(-1);
  });
  test('M06 grants next-turn AP before preparing its level-three penetration', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M06', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'end', hook: 'TURN_END', apLeft: 2 }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'start', hook: 'TURN_START' }), memory).apDelta).toBe(1);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'attack', hook: 'BEFORE_ATTACK' }), memory).armorPenetrationBonus).toBe(0.2);
  });
  test('new status extenders stay profession-agnostic', () => {
    const memory = createMinghenTriggerMemory();
    const result = resolveMinghenEffects(
      [{ id: 'M27', level: 3 }, { id: 'M28', level: 3 }, { id: 'M29', level: 3 }],
      ctx({
        hook: 'BEFORE_HIT',
        targetHasStatus: true,
        targetStatuses: ['BLEED', 'POISON', 'BURN', 'CHILL'],
      }),
      memory,
    );
    expect(result.damageMultiplierBonus).toBeCloseTo(0.15 + 0.35 + 0.3);
  });
  test('M32 turns a skipped attack into a discounted empowered strike', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M32', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'end', hook: 'TURN_END', attackedThisTurn: false }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'before-attack', hook: 'BEFORE_ATTACK' }), memory).apDelta).toBe(-1);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'before-hit', hook: 'BEFORE_HIT' }), memory).damageMultiplierBonus).toBe(0.15);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'kill', hook: 'KILL' }), memory).apDelta).toBe(1);
  });
  test('M35 reacts to shield break without a profession dependency', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M35', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'shield', hook: 'SHIELD_BROKEN' }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'before-attack', hook: 'BEFORE_ATTACK' }), memory).apDelta).toBe(-1);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'before-hit', hook: 'BEFORE_HIT' }), memory).damageMultiplierBonus).toBe(0.3);
  });
  test('M38 chains kill into movement and follow-up kill refund', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M38', level: 3 as const }];
    resolveMinghenEffects(loadout, ctx({ eventId: 'kill-1', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'move', hook: 'BEFORE_MOVE' }), memory).moveCostReduction).toBe(1);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'hit', hook: 'BEFORE_HIT' }), memory).damageMultiplierBonus).toBe(0.15);
    expect(resolveMinghenEffects(loadout, ctx({ eventId: 'kill-2', hook: 'KILL', source: 'ACTIVE_ACTION' }), memory).apDelta).toBe(1);
  });
  test('pruneMinghenMemory drops stale event/turn keys but keeps layer/state', () => {
    const memory = createMinghenTriggerMemory();
    memory.eventKeys.push('3:0:ATTACK:AFTER_HIT:M03', '12:1:MOVE:AFTER_MOVE:M08');
    memory.turnKeys.push('MINGHEN_TURN_CHOICE:3', '12:M01');
    memory.layerKeys.push('M16');
    memory.states.push('M05_READY');
    const pruned = pruneMinghenMemory(memory, 12);
    expect(pruned.eventKeys).toEqual(['12:1:MOVE:AFTER_MOVE:M08']);
    expect(pruned.turnKeys).toEqual(['12:M01']);
    expect(pruned.layerKeys).toEqual(['M16']);
    expect(pruned.states).toEqual(['M05_READY']);
  });
});
