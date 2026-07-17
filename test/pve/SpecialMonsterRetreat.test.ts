import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { makeExpeditionState, makeMonster } from './helpers';

describe('特殊怪半血撤退', () => {
  it('首次跌破 50% HP 时立即远离最多 3 格且仅标记一次', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 1, y: 1 },
        ap: 20,
        monsters: [makeMonster('sentinel', { x: 2, y: 1 }, {
          variantId: 'GOBLIN_SENTINEL', hp: 55, maxHp: 100, armor: 0,
        })],
      },
    });

    const result = playerAttack(state, 'sentinel');
    const sentinel = result.state.floorState.monsters.find((monster) => monster.id === 'sentinel');
    expect(sentinel?.hp).toBe(42);
    expect(Math.abs((sentinel?.pos.x ?? 0) - 1) + Math.abs((sentinel?.pos.y ?? 0) - 1)).toBe(4);
    expect(sentinel?.specialRetreatUsed).toBe(true);
    expect(result.events.filter((event) => event.type === 'MOVE')).toHaveLength(3);
  });
});
