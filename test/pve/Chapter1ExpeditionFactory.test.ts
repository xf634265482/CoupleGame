import { createChapter1ExpeditionState } from '../../assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 7,
    highestClearedFloor: 6,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    updatedAt: 1,
  };
}

function challenge(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 100 + floor,
    status: 'ACTIVE',
    config: {
      professionId: 'WARRIOR',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('Chapter 1 official ExpeditionState factory', () => {
  test.each([1, 2, 3, 4, 5, 6, 7])('builds floor %i with original AP and configured fog rules', (floor) => {
    const state = createChapter1ExpeditionState(challenge(floor), profile());
    expect(state.floor).toBe(floor);
    expect(state.floorState.floor).toBe(floor);
    expect(state.floorState.ap).toBeGreaterThanOrEqual(8);
    expect(state.floorState.ap).toBeLessThanOrEqual(13);
    expect(state.floorState.maxAp).toBe(state.floorState.ap);
    expect(state.floorState.revealed.flat().some(Boolean)).toBe(true);
    expect(state.floorState.revealed.flat().every(Boolean)).toBe(floor >= 3 && floor <= 6);
    expect(state.floorState.entities.some((entity) => entity.type === 'ROCK')).toBe(true);
  });

  test('maps the seven fixed objective entity sets', () => {
    const states = Array.from({ length: 7 }, (_, index) => createChapter1ExpeditionState(challenge(index + 1), profile()));
    expect(states[0]!.floorState.entities.some((entity) => entity.type === 'KEY')).toBe(true);
    expect(states[2]!.floorState.entities.filter((entity) => entity.type === 'ALTAR')).toHaveLength(1);
    expect(states[3]!.floorState.entities.filter((entity) => entity.type === 'ESCAPE_MARKER')).toHaveLength(1);
    expect(states[3]!.floorState.entities.filter((entity) => entity.type === 'EXIT')).toHaveLength(0);
    const sentinel = states[3]!.floorState.monsters.find((monster) => monster.id === 'GOBLIN_SENTINEL');
    expect(sentinel).toMatchObject({ maxHp: 90, attack: 0, range: 0, aggroRadius: 3, aiState: 'FLEE' });
    const warrior = states[0]!.floorState.monsters.find((monster) => monster.id === 'f1_w1');
    expect(warrior).toMatchObject({ maxHp: 40, attack: 13, range: 1, aggroRadius: 3 });
    const chief = states[6]!.floorState.monsters.find((monster) => monster.bossId === 'GOBLIN_CHIEF');
    expect(chief).toMatchObject({ maxHp: 660, attack: 45, range: 1, aggroRadius: 99 });
    expect(states[4]!.floorState.entities.filter((entity) => entity.type === 'GUNPOWDER_BARREL')).toHaveLength(1);
    expect(states[4]!.floorState.entities.filter((entity) => entity.type === 'BLAST_TARGET')).toHaveLength(1);
    expect(states[4]!.floorState.entities.filter((entity) => entity.type === 'EXIT')).toHaveLength(0);
    expect(states[5]!.floorState.monsters.filter((monster) => monster.id.startsWith('wave1_'))).toHaveLength(2);
    expect(states[5]!.floorState.entities.filter((entity) => entity.id.startsWith('WAVE_SPAWN_') && entity.type === 'WAVE_SPAWN_MARKER')).toHaveLength(4);
    expect(states[5]!.floorState.entities.filter((entity) => entity.type === 'PORTAL')).toHaveLength(0);
    expect(states[6]!.floorState.monsters.some((monster) => monster.bossId === 'GOBLIN_CHIEF')).toBe(true);
  });

  test('warrior starts unequipped with profession base HP and AP band', () => {
    const state = createChapter1ExpeditionState(challenge(1), profile());
    expect(state.player.equipment.WEAPON).toBeUndefined();
    expect(state.player.maxHp).toBe(320);
    expect(state.player.hp).toBe(320);
    expect(state.player.classId).toBe('BERSERKER');
    expect(state.floorState.ap).toBeGreaterThanOrEqual(8);
    expect(state.floorState.ap).toBeLessThanOrEqual(13);
  });
});
