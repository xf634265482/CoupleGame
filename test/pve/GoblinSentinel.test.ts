import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import { stepMonsters } from '../../assets/scripts/pve/core/MonsterAI';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

describe('goblin sentinel support / flee rules', () => {
  it('floor 4 objective advances one step toward escape after surviving a hit', () => {
    const state = makeExpeditionState({
      floor: 4,
      floorOverrides: {
        player: { x: 1, y: 7 },
        ap: 10,
        entities: [makeEntity('escape', 'ESCAPE_MARKER', { x: 7, y: 0 })],
        monsters: [
          makeMonster('GOBLIN_SENTINEL', { x: 1, y: 6 }, {
            hp: 40,
            maxHp: 90,
            variantId: 'GOBLIN_SENTINEL',
            attack: 0,
            range: 0,
            aiState: 'FLEE',
          }),
        ],
      },
    });

    const result = playerAttack(state, 'GOBLIN_SENTINEL');

    expect(result.state.floorState.monsters.find((m) => m.id === 'GOBLIN_SENTINEL')?.pos).toEqual({ x: 1, y: 5 });
    expect(result.events.map((event) => event.type)).toEqual(['ATTACK', 'MOVE']);
  });

  it('any goblin sentinel flees one cell away from the player after a surviving hit', () => {
    const state = makeExpeditionState({
      floor: 5,
      floorOverrides: {
        player: { x: 2, y: 2 },
        ap: 10,
        monsters: [
          makeMonster('sentinel_a', { x: 3, y: 2 }, {
            hp: 90,
            maxHp: 90,
            variantId: 'GOBLIN_SENTINEL',
            attack: 0,
            range: 0,
          }),
        ],
      },
    });

    const result = playerAttack(state, 'sentinel_a');
    const sentinel = result.state.floorState.monsters.find((m) => m.id === 'sentinel_a');
    expect(sentinel?.aiState).toBe('FLEE');
    expect(Math.abs((sentinel?.pos.x ?? 0) - 3) + Math.abs((sentinel?.pos.y ?? 0) - 2)).toBe(1);
    expect(Math.abs((sentinel?.pos.x ?? 0) - 2) + Math.abs((sentinel?.pos.y ?? 0) - 2)).toBeGreaterThanOrEqual(2);
    expect(result.events.filter((event) => event.type === 'MOVE')).toHaveLength(1);
  });

  it('goblin sentinel never attacks on its monster turn', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        player: { x: 2, y: 2 },
        ap: 10,
        monsters: [
          makeMonster('sentinel_a', { x: 3, y: 2 }, {
            hp: 90,
            maxHp: 90,
            variantId: 'GOBLIN_SENTINEL',
            attack: 8,
            range: 4,
            aggroRadius: 5,
            aiState: 'IDLE',
          }),
        ],
      },
    });

    const result = stepMonsters(state);
    expect(result.events.some((event) => event.type === 'ATTACK')).toBe(false);
    expect(result.events.some((event) => event.type === 'PLAYER_DAMAGED')).toBe(false);
  });
});
