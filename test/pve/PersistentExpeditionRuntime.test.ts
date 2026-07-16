import { serializeFloorRuntime } from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import {
  applyPersistentBattleResult,
  applyPersistentMinghenTurnChoice,
  createPersistentFloorRuntime,
  resumeOrRebuildPersistentRuntime,
  resumePersistentRuntimeV2,
  syncRuntimeFromExpedition,
  isPersistentMoveBlocked,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { PveEvent } from '../../assets/scripts/pve/core/PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(): PveProfile {
  return {
    version: 1, highestUnlockedFloor: 1, highestClearedFloor: 0, floorRecords: {},
    minghenCollection: {}, minghenLoadout: [], minghenPresets: [], equipmentInventory: [],
    equipmentLoadout: {}, gold: 0, minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR', tracking: null, activeChallengeId: 'c1', updatedAt: 1,
  };
}

const snapshot: FloorChallengeSnapshot = {
  challengeId: 'c1', userId: 'u1', floor: 1, mode: 'PROGRESSION', seed: 77, status: 'ACTIVE',
  config: { professionId: 'WARRIOR', equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
  startedAt: 1, updatedAt: 1,
};

describe('persistent official expedition runtime', () => {
  test('mirrors official ExpeditionState resources and restores V2 exactly', () => {
    const runtime = createPersistentFloorRuntime(snapshot, profile(), undefined, 10);
    expect(runtime.version).toBe(2);
    expect(runtime.resources.ap).toBe(runtime.battleState.expedition.floorState.ap);
    const movedExpedition = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        ap: runtime.battleState.expedition.floorState.ap - 2,
        revealed: runtime.battleState.expedition.floorState.revealed.map((row) => [...row]),
      },
    };
    movedExpedition.floorState.revealed[0]![0] = true;
    const synced = syncRuntimeFromExpedition(runtime, movedExpedition, 20);
    const restored = resumePersistentRuntimeV2(snapshot, serializeFloorRuntime(synced));
    expect(restored.resources.ap).toBe(movedExpedition.floorState.ap);
    expect(restored.battleState.expedition.floorState.revealed).toEqual(movedExpedition.floorState.revealed);
    expect(restored.rngState).toBe(movedExpedition.floorState.rngState);
  });

  test('rebuilds only known V1 payloads under the same challenge snapshot', () => {
    const old = JSON.stringify({ version: 1, runtime: { version: 1 } });
    const rebuilt = resumeOrRebuildPersistentRuntime(snapshot, old, profile(), 30);
    expect(rebuilt.version).toBe(2);
    expect(rebuilt.challengeId).toBe(snapshot.challengeId);
    expect(rebuilt.floor).toBe(snapshot.floor);
    expect(rebuilt.seed).toBe(snapshot.seed);
    expect(rebuilt.config.professionId).toBe(snapshot.config.professionId);
  });

  test('rejects unknown runtime versions', () => {
    expect(() => resumeOrRebuildPersistentRuntime(
      snapshot,
      JSON.stringify({ version: 9, runtime: { version: 9 } }),
      profile(),
    )).toThrow('FLOOR_RUNTIME_VERSION_MISMATCH');
  });

  test('persistent shield absorbs official player damage before hp is committed', () => {
    const base = createPersistentFloorRuntime(snapshot, profile(), undefined, 1);
    const runtime = { ...base, resources: { ...base.resources, shield: 8 } };
    const damagedState = {
      ...base.battleState.expedition,
      player: { ...base.battleState.expedition.player, hp: base.battleState.expedition.player.hp - 12 },
    };
    const applied = applyPersistentBattleResult(runtime, {
      state: damagedState,
      events: [{ type: 'PLAYER_DAMAGED', damage: 12, hp: damagedState.player.hp, sourceId: 'TEST' }],
    });
    expect(applied.runtime.resources.shield).toBe(0);
    expect(applied.result.state.player.hp).toBe(base.battleState.expedition.player.hp - 4);
    expect(applied.result.events[0]).toMatchObject({ type: 'PLAYER_DAMAGED', damage: 4 });
  });

  test('M23 and M24 turn choices are explicit and can only be made once per turn', () => {
    const withChoices = {
      ...snapshot,
      config: {
        ...snapshot.config,
        minghenLoadout: [{ id: 'M23', level: 2 as const }, { id: 'M24', level: 1 as const }],
      },
    };
    const base = createPersistentFloorRuntime(withChoices, profile(), undefined, 1);
    const bloodForged = applyPersistentMinghenTurnChoice(base, 'M23');
    expect(bloodForged.resources.ap).toBe(base.resources.ap + 2);
    expect(bloodForged.resources.hp).toBeLessThan(base.resources.hp);
    expect(applyPersistentMinghenTurnChoice(bloodForged, 'M24')).toBe(bloodForged);
    const stillField = applyPersistentMinghenTurnChoice({
      ...base,
      turn: base.turn + 1,
      battleState: {
        ...base.battleState,
        expedition: {
          ...base.battleState.expedition,
          floorState: { ...base.battleState.expedition.floorState, turn: base.turn + 1 },
        },
      },
    }, 'M24');
    expect(isPersistentMoveBlocked(stillField)).toBe(true);
  });

  test('floor 6 advances all five persisted waves immediately on clear', () => {
    const floor6 = { ...snapshot, challengeId: 'c6', floor: 6 };
    let runtime = createPersistentFloorRuntime(floor6, profile(), undefined, 1);
    const waveSizes = [2, 2, 3, 3, 4];
    for (let wave = 1; wave <= 5; wave += 1) {
      const aliveIds = [...(runtime.battleState.objective.data.aliveIds as string[])];
      expect(aliveIds).toHaveLength(waveSizes[wave - 1]);
      const kills: PveEvent[] = aliveIds.map((monsterId) => ({ type: 'KILL', monsterId, monsterType: 'NORMAL' }));
      const deadState = {
        ...runtime.battleState.expedition,
        floorState: {
          ...runtime.battleState.expedition.floorState,
          monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
            aliveIds.includes(monster.id)
              ? { ...monster, hp: 0, aiState: 'DEAD' as const }
              : monster
          )),
        },
      };
      runtime = applyPersistentBattleResult(runtime, { state: deadState, events: kills }, wave * 10).runtime;
      if (wave < 5) {
        expect(runtime.battleState.objective.data.preparationTurns).toBe(0);
        expect(runtime.battleState.objective.data.currentWave).toBe(wave + 1);
        const restored = resumePersistentRuntimeV2(floor6, serializeFloorRuntime(runtime));
        expect(restored.battleState.objective.data.currentWave).toBe(wave + 1);
        runtime = restored;
      }
    }
    // Objective complete only spawns portal; clear requires manual interactPortal.
    expect(runtime.status).toBe('ACTIVE');
    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    expect(runtime.battleState.expedition.floorState.entities.some((entity) => entity.type === 'PORTAL' && !entity.consumed)).toBe(true);
  });

  test('floor 6 wave spawn rushes the whole wave toward the player', () => {
    const floor6 = { ...snapshot, challengeId: 'c6_rush', floor: 6 };
    const runtime = createPersistentFloorRuntime(floor6, profile(), undefined, 1);
    const player = runtime.battleState.expedition.floorState.player;
    const wave1 = runtime.battleState.expedition.floorState.monsters.filter((monster) => monster.id.startsWith('wave1_'));
    expect(wave1).toHaveLength(2);
    for (const monster of wave1) {
      expect(monster.aiState).toBe('CHASE');
      // ??????????? 8??? 4 ??????????
      expect(Math.abs(monster.pos.x - player.x) + Math.abs(monster.pos.y - player.y)).toBeLessThanOrEqual(4);
    }

    const wave1Ids = wave1.map((monster) => monster.id);
    const deadState = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
          wave1Ids.includes(monster.id)
            ? { ...monster, hp: 0, aiState: 'DEAD' as const }
            : monster
        )),
      },
    };
    const next = applyPersistentBattleResult(
      runtime,
      { state: deadState, events: wave1Ids.map((monsterId) => ({ type: 'KILL' as const, monsterId, monsterType: 'NORMAL' as const })) },
      10,
    ).runtime;
    const wave2 = next.battleState.expedition.floorState.monsters.filter(
      (monster) => monster.id.startsWith('wave2_') && monster.hp > 0,
    );
    expect(wave2).toHaveLength(2);
    for (const monster of wave2) {
      expect(monster.aiState).toBe('CHASE');
      expect(Math.abs(monster.pos.x - player.x) + Math.abs(monster.pos.y - player.y)).toBeLessThanOrEqual(5);
    }
  });

  test('floor 6 automatically spawns wave 2 after wave 1 is cleared', () => {
    const floor6 = { ...snapshot, challengeId: 'c6_auto', floor: 6 };
    const runtime = createPersistentFloorRuntime(floor6, profile(), undefined, 1);
    const wave1Ids = [...(runtime.battleState.objective.data.aliveIds as string[])];
    const kills: PveEvent[] = wave1Ids.map((monsterId) => ({ type: 'KILL', monsterId, monsterType: 'NORMAL' }));
    const deadState = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
          wave1Ids.includes(monster.id)
            ? { ...monster, hp: 0, aiState: 'DEAD' as const }
            : monster
        )),
      },
    };

    const applied = applyPersistentBattleResult(runtime, { state: deadState, events: kills }, 10);
    const next = applied.runtime;

    expect(next.battleState.objective.data.currentWave).toBe(2);
    expect(next.battleState.objective.data.preparationTurns).toBe(0);
    expect(next.battleState.objective.data.aliveIds).toEqual(['wave2_0', 'wave2_1']);
    expect(next.battleState.expedition.floorState.monsters.filter((monster) => monster.id.startsWith('wave2_'))).toHaveLength(2);
    expect(applied.result.events.some((event) => event.type === 'WAVE_INCOMING' && event.wave === 2)).toBe(true);
    expect(applied.result.events.filter((event) => event.type === 'MONSTER_SPAWNED')).toHaveLength(2);
  });

  test('floor 6 reconciles dead wave monsters without KILL events and spawns next wave', () => {
    const floor6 = { ...snapshot, challengeId: 'c6_reconcile', floor: 6 };
    const runtime = createPersistentFloorRuntime(floor6, profile(), undefined, 1);
    const deadWave1 = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
          monster.id.startsWith('wave1_')
            ? { ...monster, hp: 0, aiState: 'DEAD' as const }
            : monster
        )),
      },
    };

    const next = applyPersistentBattleResult(runtime, { state: deadWave1, events: [{ type: 'TURN_END', turn: deadWave1.floorState.turn }] }, 10).runtime;

    expect(next.battleState.objective.data.currentWave).toBe(2);
    expect(next.battleState.objective.data.preparationTurns).toBe(0);
    expect(next.battleState.objective.data.aliveIds).toEqual(['wave2_0', 'wave2_1']);
    expect(next.battleState.expedition.floorState.monsters.filter((monster) => monster.id.startsWith('wave2_') && monster.hp > 0)).toHaveLength(2);
    expect(next.battleState.expedition.floorState.entities.filter((entity) => entity.type === 'WAVE_SPAWN_MARKER')).toHaveLength(4);
  });

  test('floor 6 recovers when aliveIds are empty but wave 1 is dead on the battlefield', () => {
    const floor6 = { ...snapshot, challengeId: 'c6_empty_alive', floor: 6 };
    let runtime = createPersistentFloorRuntime(floor6, profile(), undefined, 1);
    runtime = {
      ...runtime,
      battleState: {
        ...runtime.battleState,
        objective: {
          ...runtime.battleState.objective,
          data: { currentWave: 1, aliveIds: [], preparationTurns: 0 },
        },
      },
    };
    const deadWave1 = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
          monster.id.startsWith('wave1_')
            ? { ...monster, hp: 0, aiState: 'DEAD' as const }
            : monster
        )),
      },
    };
    const next = applyPersistentBattleResult(runtime, { state: deadWave1, events: [] }, 10).runtime;
    expect(next.battleState.objective.data.currentWave).toBe(2);
    expect(next.battleState.expedition.floorState.monsters.filter((monster) => monster.id.startsWith('wave2_') && monster.hp > 0)).toHaveLength(2);
  });
});
