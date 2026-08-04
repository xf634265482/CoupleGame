import {
  complete,
  failOnTerminalEvent,
  type FloorObjectiveState,
  type ObjectiveApplyResult,
  type ObjectiveDefinition,
  type ObjectiveEvent,
} from '../objectives/FloorObjective';

const base = (
  floor: number,
  kind: FloorObjectiveState['kind'],
  target: number,
  data: Record<string, unknown>,
): FloorObjectiveState => ({
  version: 1,
  floor,
  kind,
  status: 'ACTIVE',
  progress: 0,
  target,
  data,
});

const terminal = (
  state: FloorObjectiveState,
  event: ObjectiveEvent,
): ObjectiveApplyResult | null => failOnTerminalEvent(state, event);

function stringList(value: unknown, fallback: readonly string[] = []): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [...fallback];
}

function killTargetDefinition(
  floor: number,
  kind: 'ELITE_HUNT' | 'BOSS',
  id: string,
  title: string,
  description: string,
): ObjectiveDefinition {
  return {
    id: `CH2_F${floor}_${kind}`,
    floor,
    kind,
    title,
    description,
    create: () => base(floor, kind, 1, { targetId: id }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      if (event.type === 'ENTITY_KILLED' && event.entityId === id) return complete(state);
      return { state, commands: [] };
    },
  };
}

function createKeyExploreObjective(floor: number): ObjectiveDefinition {
  return {
    id: `CH2_F${floor}_KEY`,
    floor,
    kind: 'KEY_EXPLORE',
    title: '取得钥匙',
    description: '探索迷雾，取得钥匙。注意沙坑会额外消耗移动 AP；完成后传送门会出现在钥匙位置。',
    create: () => base(floor, 'KEY_EXPLORE', 1, { hasKey: false }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      if (event.type === 'KEY_ACQUIRED' && !state.data.hasKey) {
        return complete({
          ...state,
          progress: 1,
          data: { ...state.data, hasKey: true },
        });
      }
      return { state, commands: [] };
    },
  };
}

function createSentinelPurgeObjective(): ObjectiveDefinition {
  const sentinelIds = ['F10_SENTINEL_1', 'F10_SENTINEL_2'];
  return {
    id: 'CH2_F10_PURGE',
    floor: 10,
    kind: 'PURGE',
    title: '清除沙暴警戒者',
    description: '消灭全部沙暴警戒者后开启传送门；警戒者全灭后围猎压力会下降。',
    create: () => base(10, 'PURGE', sentinelIds.length, { sentinelIds: [...sentinelIds], cleared: [] as string[] }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      let cleared = stringList(state.data.cleared);
      if (event.type === 'ENTITY_KILLED' && sentinelIds.includes(event.entityId)) {
        cleared = [...new Set([...cleared, event.entityId])];
      }
      const next = {
        ...state,
        progress: cleared.length,
        data: { ...state.data, cleared },
      };
      return cleared.length >= sentinelIds.length ? complete(next) : { state: next, commands: [] };
    },
  };
}

function createChaseObjective(): ObjectiveDefinition {
  return {
    id: 'CH2_F11_CHASE',
    floor: 11,
    kind: 'CHASE',
    title: '截获沙漠逃兵',
    description: '追上携令逃跑的目标；若其抵达逃离点则失败。',
    create: () => base(11, 'CHASE', 1, { targetId: 'CHASE_TARGET' }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      if (event.type === 'ENTITY_KILLED' && event.entityId === 'CHASE_TARGET') return complete(state);
      if (event.type === 'TARGET_ESCAPED' && event.entityId === 'CHASE_TARGET') {
        return {
          state: { ...state, status: 'FAILED' },
          commands: [{ type: 'OBJECTIVE_FAILED', reason: 'TARGET_ESCAPED' }],
        };
      }
      return { state, commands: [] };
    },
  };
}

function createTimedEscapeObjective(): ObjectiveDefinition {
  return {
    id: 'CH2_F12_TIMED',
    floor: 12,
    kind: 'TIMED_ESCAPE',
    title: '沙暴走廊突围',
    description: '在 12 个回合内抵达出口并互动通关。',
    create: () => base(12, 'TIMED_ESCAPE', 12, { turnsLeft: 12, turnLimit: 12, reachedExit: false }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      let turnsLeft = Number(state.data.turnsLeft ?? 12);
      const reachedExit = state.data.reachedExit === true;
      if (event.type === 'EXIT_INTERACTED') {
        return complete({ ...state, progress: 12, data: { ...state.data, reachedExit: true, turnsLeft } });
      }
      if (event.type === 'PLAYER_TURN_ENDED') {
        turnsLeft -= 1;
        if (turnsLeft <= 0 && !reachedExit) {
          return {
            state: { ...state, status: 'FAILED', data: { ...state.data, turnsLeft: 0 } },
            commands: [{ type: 'OBJECTIVE_FAILED', reason: 'TURN_LIMIT' }],
          };
        }
      }
      return {
        state: {
          ...state,
          progress: 12 - turnsLeft,
          data: { ...state.data, turnsLeft, reachedExit },
        },
        commands: [],
      };
    },
  };
}

function createWaveSurvivalObjective(floor: number, waveCount: number): ObjectiveDefinition {
  return {
    id: `CH2_F${floor}_WAVES`,
    floor,
    kind: 'WAVE_SURVIVAL',
    title: '守住流沙潮汐',
    description: `清空 ${waveCount} 波敌人并存活；波次清空后出现传送门。`,
    create: () => base(floor, 'WAVE_SURVIVAL', waveCount, { currentWave: 0, aliveIds: [], preparationTurns: 0 }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      let currentWave = Number(state.data.currentWave ?? 0);
      let aliveIds = stringList(state.data.aliveIds);
      let preparationTurns = Number(state.data.preparationTurns ?? 0);
      const commands: ObjectiveApplyResult['commands'] = [];
      if (event.type === 'WAVE_SPAWNED') {
        if (event.wave !== currentWave + 1) return { state, commands: [] };
        currentWave = event.wave;
        aliveIds = [...new Set(event.entityIds)];
        preparationTurns = 0;
      } else if (event.type === 'ENTITY_KILLED' && aliveIds.includes(event.entityId)) {
        aliveIds = aliveIds.filter((id) => id !== event.entityId);
        if (aliveIds.length === 0) {
          if (currentWave >= waveCount) {
            return complete({ ...state, progress: waveCount, data: { currentWave, aliveIds, preparationTurns: 0 } });
          }
          preparationTurns = 0;
          const nextWave = currentWave + 1;
          commands.push({ type: 'WARN_WAVE', wave: nextWave });
          commands.push({ type: 'SPAWN_WAVE', wave: nextWave });
        }
      } else if (event.type === 'PLAYER_TURN_ENDED' && preparationTurns > 0) {
        preparationTurns -= 1;
        if (preparationTurns === 0) {
          commands.push({ type: 'WARN_WAVE', wave: currentWave + 1 });
          commands.push({ type: 'SPAWN_WAVE', wave: currentWave + 1 });
        }
      }
      return {
        state: { ...state, progress: currentWave, data: { currentWave, aliveIds, preparationTurns } },
        commands,
      };
    },
  };
}

export const CHAPTER2_OBJECTIVES: Record<number, ObjectiveDefinition> = {
  8: createKeyExploreObjective(8),
  9: killTargetDefinition(9, 'ELITE_HUNT', 'FLOOR9_ELITE', '击败毒蝎精英', '找到并击败本层精英。'),
  10: createSentinelPurgeObjective(),
  11: createChaseObjective(),
  12: createTimedEscapeObjective(),
  13: createWaveSurvivalObjective(13, 4),
  14: killTargetDefinition(14, 'BOSS', 'QUICKSAND_SCORPION', '击败流沙巨蝎', '利用沙坑与走位击败流沙巨蝎。'),
};

export function getChapter2Objective(floor: number): ObjectiveDefinition {
  const value = CHAPTER2_OBJECTIVES[floor];
  if (!value) throw new Error('CHAPTER2_OBJECTIVE_NOT_FOUND');
  return value;
}
