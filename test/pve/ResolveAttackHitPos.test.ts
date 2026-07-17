import { resolveAttackHitPos } from '../../assets/scripts/pve/core/AttackPresentation';
import type { PveEvent } from '../../assets/scripts/pve/core/PveTypes';

describe('resolveAttackHitPos', () => {
  test('uses MOVE.from when the target flees in the same event batch', () => {
    const events: PveEvent[] = [
      { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'GOBLIN_SENTINEL', damage: 10, targetHp: 20 },
      {
        type: 'MOVE',
        entityId: 'GOBLIN_SENTINEL',
        from: { x: 1, y: 6 },
        to: { x: 1, y: 5 },
        apLeft: 7,
      },
    ];
    expect(resolveAttackHitPos(events, 'GOBLIN_SENTINEL', { x: 1, y: 5 })).toEqual({ x: 1, y: 6 });
  });

  test('uses hopper reaction from when present', () => {
    const events: PveEvent[] = [
      { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 5, targetHp: 10 },
      {
        type: 'HOPPER_REACTION_ADVANCED',
        monsterId: 'm1',
        from: { x: 2, y: 2 },
        to: { x: 3, y: 2 },
      },
    ];
    expect(resolveAttackHitPos(events, 'm1', { x: 3, y: 2 })).toEqual({ x: 2, y: 2 });
  });

  test('falls back to the provided final position when there is no reaction move', () => {
    const events: PveEvent[] = [
      { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 5, targetHp: 10 },
    ];
    expect(resolveAttackHitPos(events, 'm1', { x: 4, y: 4 })).toEqual({ x: 4, y: 4 });
  });
});
