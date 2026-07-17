import { createMinghenTriggerMemory, pruneMinghenMemory, resolveMinghenEffects } from '../../assets/scripts/pve/core/minghen/MinghenEffects';
import type { MinghenEventContext } from '../../assets/scripts/pve/core/minghen/MinghenEventContext';

function ctx(overrides: Partial<MinghenEventContext>): MinghenEventContext {
  return { eventId: 'e1', hook: 'BEFORE_HIT', turn: 1, source: 'ACTIVE_ACTION', ...overrides };
}
describe('Minghen effects', () => {
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
