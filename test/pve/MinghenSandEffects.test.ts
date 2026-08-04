import {
  environmentDamageMultiplier,
  markExtraMoveCostTerrainStepWaived,
  sandstormDamageMultiplier,
  shouldWaiveExtraMoveCostTerrainStep,
} from '../../assets/scripts/pve/core/minghen/SandMinghenBridge';
import { getMinghenDefinition } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import { resolveMinghenEffects, createMinghenTriggerMemory } from '../../assets/scripts/pve/core/minghen/MinghenEffects';

describe('Minghen sand effects M25/M26', () => {
  test('catalog defines M25 and M26 with chapter-two source floors', () => {
    expect(getMinghenDefinition('M25').sourceFloor).toBe(12);
    expect(getMinghenDefinition('M26').sourceFloor).toBe(14);
  });

  test('M26 reduces sandstorm damage by tier', () => {
    expect(sandstormDamageMultiplier([{ id: 'M26', level: 1 }])).toBe(0.7);
    expect(sandstormDamageMultiplier([{ id: 'M26', level: 2 }])).toBe(0.5);
    expect(sandstormDamageMultiplier([])).toBe(1);
    expect(environmentDamageMultiplier([{ id: 'M26', level: 1 }])).toBe(0.7);
  });

  test('M25 waiver is once per turn for any extra-move terrain tag', () => {
    const memory = createMinghenTriggerMemory();
    const loadout = [{ id: 'M25', level: 2 as const }];
    expect(shouldWaiveExtraMoveCostTerrainStep(loadout, memory, 1)).toBe(true);
    markExtraMoveCostTerrainStepWaived(memory, 1);
    expect(shouldWaiveExtraMoveCostTerrainStep(loadout, memory, 1)).toBe(false);
  });

  test('M25 grants sand-pit attack bonus when standing on sand', () => {
    const memory = createMinghenTriggerMemory();
    const effect = resolveMinghenEffects([{ id: 'M25', level: 3 }], {
      eventId: 't1:before-hit',
      hook: 'BEFORE_HIT',
      turn: 1,
      source: 'ACTIVE_ACTION',
      attackerOnSandPit: true,
    }, memory);
    expect(effect.damageMultiplierBonus).toBeCloseTo(0.15);
  });
});
