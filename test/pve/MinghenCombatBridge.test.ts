import { createMinghenTriggerMemory, resolveMinghenEffects } from '../../assets/scripts/pve/core/minghen/MinghenEffects';
import {
  applyOverflowDamageMitigation,
  buildAttackContext,
} from '../../assets/scripts/pve/core/minghen/MinghenCombatBridge';
import { makeExpeditionState, makeMonster } from './helpers';

describe('MinghenCombatBridge', () => {
  test('attack context marks isolated target when no adjacent foes', () => {
    const expedition = makeExpeditionState({
      floorOverrides: {
        player: { x: 4, y: 4 },
        monsters: [
          makeMonster('target', { x: 6, y: 4 }),
          makeMonster('far', { x: 0, y: 0 }),
        ],
      },
    });
    const context = buildAttackContext(expedition, 'target', []);
    expect(context.targetAdjacentEnemyCount).toBe(0);
    expect(context.adjacentEnemyCount).toBe(0);

    const memory = createMinghenTriggerMemory();
    const effect = resolveMinghenEffects(
      [{ id: 'M39', level: 1 }],
      {
        ...context,
        eventId: 'hit',
        hook: 'BEFORE_HIT',
      },
      memory,
    );
    expect(effect.damageMultiplierBonus).toBeCloseTo(0.18);
  });

  test('overflow mitigation: maxHp=100, raw=40, ratio=0.3 → 34', () => {
    expect(applyOverflowDamageMitigation(100, 40, 0.3)).toBeCloseTo(34);
  });
});
