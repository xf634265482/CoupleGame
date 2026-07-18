import { createMinghenTriggerMemory, resolveMinghenEffects } from '../../assets/scripts/pve/core/minghen/MinghenEffects';
import type { MinghenEffectResult, MinghenEventContext } from '../../assets/scripts/pve/core/minghen/MinghenEventContext';

function ctx(overrides: Partial<MinghenEventContext>): MinghenEventContext {
  return { eventId: 'e1', hook: 'BEFORE_HIT', turn: 1, source: 'ACTIVE_ACTION', ...overrides };
}

type Case = {
  id: string;
  level: 1 | 2 | 3;
  contexts: Partial<MinghenEventContext>[];
  expect: (r: MinghenEffectResult) => void;
};

const cases: Case[] = [
  {
    id: 'M39', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetAdjacentEnemyCount: 0 }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.18),
  },
  {
    id: 'M39', level: 3,
    contexts: [{ hook: 'KILL', targetAdjacentEnemyCount: 0 }],
    expect: (r) => expect(r.spiritGain).toBe(10),
  },
  {
    id: 'M40', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetAdjacentToBlocking: true }],
    expect: (r) => expect(r.armorPenetrationBonus).toBeCloseTo(0.15),
  },
  {
    id: 'M40', level: 3,
    contexts: [{ hook: 'AFTER_HIT', attackHadCollision: true }],
    expect: (r) => expect(r.secondaryDamageRatio).toBeCloseTo(0.2),
  },
  {
    id: 'M41', level: 1,
    contexts: [{ hook: 'AFTER_HIT', targetAdjacentEnemyCount: 2, actualDamage: 50 }],
    expect: (r) => {
      expect(r.transferDamageRatio).toBeCloseTo(0.2);
      expect(r.transferMaxTargets).toBe(1);
    },
  },
  {
    id: 'M41', level: 3,
    contexts: [{ hook: 'AFTER_HIT', targetAdjacentEnemyCount: 2, actualDamage: 50 }],
    expect: (r) => {
      expect(r.transferDamageRatio).toBeCloseTo(0.3);
      expect(r.transferMaxTargets).toBe(2);
    },
  },
  {
    id: 'M42', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetHasArmor: true }],
    expect: (r) => expect(r.armorPenetrationBonus).toBeCloseTo(0.25),
  },
  {
    id: 'M42', level: 3,
    contexts: [{ hook: 'AFTER_HIT', targetHasArmor: true, maxHp: 100 }],
    expect: (r) => expect(r.shield).toBeCloseTo(4),
  },
  {
    id: 'M43', level: 1,
    contexts: [{ hook: 'KILL', targetTier: 'NORMAL', source: 'ACTIVE_ACTION', maxHp: 100 }],
    expect: (r) => expect(r.shield).toBeCloseTo(5),
  },
  {
    id: 'M44', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetTier: 'ELITE' }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.15),
  },
  {
    id: 'M44', level: 3,
    contexts: [{ hook: 'BEFORE_HIT', targetTier: 'BOSS', targetHpRatio: 0.25 }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.3),
  },
  {
    id: 'M45', level: 1,
    contexts: [{ hook: 'BEFORE_MOVE', turn: 1 }],
    expect: (r) => expect(r.moveCostReduction).toBe(1),
  },
  {
    id: 'M45', level: 3,
    contexts: [{ hook: 'KILL', turn: 2, maxHp: 100 }],
    expect: (r) => expect(r.shield).toBeCloseTo(5),
  },
  {
    id: 'M46', level: 1,
    contexts: [{ hook: 'DAMAGED', damageTargetIsEscort: true, escortUnitInRange2: true, source: 'ENEMY' }],
    expect: (r) => expect(r.damageReductionRatio).toBeCloseTo(0.2),
  },
  {
    id: 'M46', level: 3,
    contexts: [{ hook: 'DAMAGED', damageTargetIsEscort: true, escortUnitInRange2: true, source: 'ENEMY', maxHp: 100 }],
    expect: (r) => expect(r.shield).toBeCloseTo(4),
  },
  {
    id: 'M47', level: 1,
    contexts: [
      { eventId: 'light', hook: 'AFTER_ATTACK', apCost: 2 },
      { eventId: 'heavy', hook: 'BEFORE_HIT', apCost: 3 },
    ],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.25),
  },
  {
    id: 'M48', level: 1,
    contexts: [{ hook: 'STATUS_APPLIED', playerStatusDuration: 3 }],
    expect: (r) => expect(r.flags).toContain('SHORTEN_PLAYER_STATUS'),
  },
  {
    id: 'M48', level: 3,
    contexts: [
      { eventId: 'status', hook: 'STATUS_APPLIED', playerStatusDuration: 3 },
      { eventId: 'hit', hook: 'BEFORE_HIT' },
    ],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.15),
  },
  {
    id: 'M49', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetHpRatio: 0.2 }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.2),
  },
  {
    id: 'M49', level: 3,
    contexts: [{ hook: 'KILL', targetHpRatio: 0.2 }],
    expect: (r) => expect(r.apDelta).toBe(1),
  },
  {
    id: 'M50', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', inDangerTerrain: true }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.2),
  },
  {
    id: 'M50', level: 3,
    contexts: [
      { eventId: 'hit', hook: 'BEFORE_HIT', inAttackWarningZone: true },
      { eventId: 'after', hook: 'AFTER_HIT', maxHp: 100 },
    ],
    expect: (r) => expect(r.shield).toBeCloseTo(5),
  },
  {
    id: 'M51', level: 1,
    contexts: [{ hook: 'TASK_INTERACT', isTaskInteract: true }],
    expect: (r) => expect(r.apDelta).toBe(-1),
  },
  {
    id: 'M52', level: 1,
    contexts: [{ hook: 'DAMAGED', forcedDisplaceDistance: 2, source: 'ENEMY' }],
    expect: (r) => expect(r.forcedDisplaceReduction).toBe(1),
  },
  {
    id: 'M52', level: 3,
    contexts: [
      { eventId: 'dmg', hook: 'DAMAGED', forcedDisplaceDistance: 2, source: 'ENEMY' },
      { eventId: 'move', hook: 'AFTER_MOVE', forcedDisplaceDistance: 1, maxHp: 100 },
    ],
    expect: (r) => expect(r.shield).toBeCloseTo(5),
  },
  {
    id: 'M53', level: 1,
    contexts: [
      { eventId: 'start', hook: 'TURN_START', adjacentEnemyCount: 1 },
      { eventId: 'hit', hook: 'BEFORE_HIT' },
    ],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.15),
  },
  {
    id: 'M54', level: 1,
    contexts: [{ hook: 'TURN_END', enemiesInRange2: 0, maxHp: 100 }],
    expect: (r) => expect(r.heal).toBe(10),
  },
  {
    id: 'M54', level: 3,
    contexts: [{ hook: 'TURN_END', enemiesInRange2: 0, maxHp: 100 }],
    expect: (r) => expect(r.spiritGain).toBe(10),
  },
  {
    id: 'M55', level: 1,
    contexts: [
      { eventId: 'start', hook: 'TURN_START', adjacentEnemyCount: 0 },
      { eventId: 'move', hook: 'BEFORE_MOVE' },
    ],
    expect: (r) => expect(r.moveCostReduction).toBe(1),
  },
  {
    id: 'M55', level: 3,
    contexts: [{ hook: 'AFTER_MOVE', activeMoveStepsThisTurn: 4, maxHp: 100 }],
    expect: (r) => expect(r.shield).toBeCloseTo(5),
  },
  {
    id: 'M56', level: 1,
    contexts: [{ hook: 'DAMAGED', adjacentToBlocking: true, actualDamage: 10, source: 'ENEMY' }],
    expect: (r) => expect(r.damageReductionRatio).toBeCloseTo(0.15),
  },
  {
    id: 'M56', level: 3,
    contexts: [
      { eventId: 'dmg', hook: 'DAMAGED', adjacentToBlocking: true, actualDamage: 10, source: 'ENEMY' },
      { eventId: 'hit', hook: 'BEFORE_HIT' },
    ],
    expect: (r) => expect(r.armorPenetrationBonus).toBeCloseTo(0.15),
  },
];

describe('Minghen V3 new effects M39-M56', () => {
  test.each(cases.map((c, i) => [i, c.id, c.level, c] as const))(
    '%s %s L%s',
    (_i, id, level, testCase) => {
      const memory = createMinghenTriggerMemory();
      const loadout = [{ id: testCase.id, level: testCase.level }];
      let last: MinghenEffectResult | null = null;
      testCase.contexts.forEach((partial, index) => {
        last = resolveMinghenEffects(loadout, ctx({ eventId: `${id}-${index}`, ...partial }), memory);
      });
      testCase.expect(last!);
    },
  );
});
