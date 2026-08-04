import {
  complete,
  failOnTerminalEvent,
  type FloorObjectiveState,
  type ObjectiveApplyResult,
  type ObjectiveDefinition,
  type ObjectiveEvent,
} from './FloorObjective';
import { CHAPTER1_BLAST_TURN_LIMIT, CHAPTER1_WAVE_FORCE_SPAWN_TURNS } from '../PveConstants';
import { CHAPTER1_FLOOR3_BLOCKER_IDS } from '../chapter1/Chapter1FloorCatalog';

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

export function createKeyExploreObjective(): ObjectiveDefinition {
  return {
    id: 'CH1_F1_KEY',
    floor: 1,
    kind: 'KEY_EXPLORE',
    title: '取得钥匙',
    description: '探索迷雾，取得钥匙。完成后传送门会出现在钥匙位置。',
    create: () => base(1, 'KEY_EXPLORE', 1, { hasKey: false }),
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

function killTargetDefinition(
  floor: number,
  kind: 'ELITE_HUNT' | 'BOSS',
  id: string,
  title: string,
  description: string,
): ObjectiveDefinition {
  return {
    id: `CH1_F${floor}_${kind}`,
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

export function createEliteHuntObjective(): ObjectiveDefinition {
  return killTargetDefinition(
    2,
    'ELITE_HUNT',
    'FLOOR2_ELITE',
    '击败双焰精英',
    '找到并击败本层精英。',
  );
}

export function createChaseObjective(): ObjectiveDefinition {
  return {
    id: 'CH1_F4_CHASE',
    floor: 4,
    kind: 'CHASE',
    title: '截获哨兵军令',
    description: '在错口石墙间追上携令哨兵并击败它。守卫会阻挠追击；哨兵抵达闪烁逃离点即失败。',
    create: () => base(4, 'CHASE', 1, { targetId: 'GOBLIN_SENTINEL' }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      if (event.type === 'ENTITY_KILLED' && event.entityId === 'GOBLIN_SENTINEL') return complete(state);
      if (event.type === 'TARGET_ESCAPED' && event.entityId === 'GOBLIN_SENTINEL') {
        return {
          state: { ...state, status: 'FAILED' },
          commands: [{ type: 'OBJECTIVE_FAILED', reason: 'SENTINEL_ESCAPED' }],
        };
      }
      return { state, commands: [] };
    },
  };
}

export function createBossObjective(): ObjectiveDefinition {
  return killTargetDefinition(
    7,
    'BOSS',
    'GOBLIN_CHIEF',
    '击败哥布林酋长',
    '利用掩体躲避重击，击败哥布林酋长。',
  );
}

export function createWaveSurvivalObjective(): ObjectiveDefinition {
  return {
    id: 'CH1_F6_WAVES',
    floor: 6,
    kind: 'WAVE_SURVIVAL',
    title: '守住五波夜袭',
    description: '四角刷怪点整波压向中场。第 3 波起若未及时清空，会按回合强制刷下一波；清空五波后出现传送门。',
    create: () => base(6, 'WAVE_SURVIVAL', 5, {
      currentWave: 0,
      aliveIds: [],
      preparationTurns: 0,
      forceSpawnTurns: 0,
    }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      let currentWave = Number(state.data.currentWave ?? 0);
      let aliveIds = stringList(state.data.aliveIds);
      let preparationTurns = Number(state.data.preparationTurns ?? 0);
      let forceSpawnTurns = Number(state.data.forceSpawnTurns ?? 0);
      const commands: ObjectiveApplyResult['commands'] = [];
      if (event.type === 'WAVE_SPAWNED') {
        if (event.wave !== currentWave + 1) return { state, commands: [] };
        currentWave = event.wave;
        aliveIds = [...new Set(event.entityIds)];
        preparationTurns = 0;
        // 第 3–4 波刷出后开始强制刷下一波倒计时；第 5 波无下一波。
        forceSpawnTurns = currentWave >= 3 && currentWave < 5
          ? CHAPTER1_WAVE_FORCE_SPAWN_TURNS
          : 0;
      } else if (event.type === 'ENTITY_KILLED' && aliveIds.includes(event.entityId)) {
        aliveIds = aliveIds.filter((id) => id !== event.entityId);
        if (aliveIds.length === 0) {
          if (currentWave >= 5) {
            return complete({
              ...state,
              progress: 5,
              data: { currentWave, aliveIds, preparationTurns: 0, forceSpawnTurns: 0 },
            });
          }
          // 清波后立刻预警并刷下一波。
          preparationTurns = 0;
          forceSpawnTurns = 0;
          const nextWave = currentWave + 1;
          commands.push({ type: 'WARN_WAVE', wave: nextWave });
          commands.push({ type: 'SPAWN_WAVE', wave: nextWave });
        }
      } else if (event.type === 'PLAYER_TURN_ENDED') {
        if (forceSpawnTurns > 0 && currentWave >= 3 && currentWave < 5) {
          forceSpawnTurns -= 1;
          if (forceSpawnTurns === 0) {
            const nextWave = currentWave + 1;
            commands.push({ type: 'WARN_WAVE', wave: nextWave });
            commands.push({ type: 'SPAWN_WAVE', wave: nextWave });
          }
        } else if (preparationTurns > 0) {
          // 旧档兼容：若仍残留 preparationTurns，结束回合时刷下一波。
          preparationTurns -= 1;
          if (preparationTurns === 0) {
            commands.push({ type: 'WARN_WAVE', wave: currentWave + 1 });
            commands.push({ type: 'SPAWN_WAVE', wave: currentWave + 1 });
          }
        }
      }
      return {
        state: {
          ...state,
          progress: currentWave,
          data: { currentWave, aliveIds, preparationTurns, forceSpawnTurns },
        },
        commands,
      };
    },
  };
}

export function createBreakthroughObjective(): ObjectiveDefinition {
  return {
    id: 'CH1_F5_BLAST',
    floor: 5,
    kind: 'BREAKTHROUGH',
    title: '爆破碎石封锁',
    description: `先激活火药桶，再在 ${CHAPTER1_BLAST_TURN_LIMIT} 个玩家回合内抵达爆破点引爆；超时失败。`,
    create: () => base(5, 'BREAKTHROUGH', 2, {
      barrelActivated: false,
      detonated: false,
      barrelId: 'F5_BARREL',
      blastId: 'F5_BLAST_TARGET',
      blastTurnsLeft: null,
      blastTurnLimit: CHAPTER1_BLAST_TURN_LIMIT,
    }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      const limit = Number(state.data.blastTurnLimit ?? CHAPTER1_BLAST_TURN_LIMIT);
      if (event.type === 'GUNPOWDER_ACTIVATED' && event.entityId === state.data.barrelId) {
        return {
          state: {
            ...state,
            progress: Math.max(state.progress, 1),
            data: {
              ...state.data,
              barrelActivated: true,
              blastTurnsLeft: limit,
            },
          },
          commands: [],
        };
      }
      if (
        event.type === 'BLAST_DETONATED'
        && event.entityId === state.data.blastId
        && state.data.barrelActivated
      ) {
        return complete({
          ...state,
          progress: 2,
          data: { ...state.data, detonated: true, blastTurnsLeft: 0 },
        });
      }
      if (
        event.type === 'PLAYER_TURN_ENDED'
        && state.data.barrelActivated
        && !state.data.detonated
      ) {
        const left = Math.max(0, Number(state.data.blastTurnsLeft ?? limit) - 1);
        if (left <= 0) {
          return {
            state: {
              ...state,
              status: 'FAILED',
              data: { ...state.data, blastTurnsLeft: 0 },
            },
            commands: [{ type: 'OBJECTIVE_FAILED', reason: 'BLAST_TURN_LIMIT' }],
          };
        }
        return {
          state: { ...state, data: { ...state.data, blastTurnsLeft: left } },
          commands: [],
        };
      }
      return { state, commands: [] };
    },
  };
}

export function createSingleAltarObjective(): ObjectiveDefinition {
  return {
    id: 'CH1_F3_ALTAR',
    floor: 3,
    kind: 'PURGE',
    title: '摧毁号角祭坛',
    description: '击败封锁通道的敌人，关闭祭坛，并清除剩余召唤物。',
    create: () => base(3, 'PURGE', 1, {
      altarId: 'ALTAR_1',
      destroyed: false,
      aliveIds: [...CHAPTER1_FLOOR3_BLOCKER_IDS],
      summonIds: [],
    }),
    apply(state, event) {
      const t = terminal(state, event);
      if (t) return t;
      let destroyed = state.data.destroyed === true;
      let aliveIds = stringList(state.data.aliveIds, CHAPTER1_FLOOR3_BLOCKER_IDS);
      let summonIds = stringList(state.data.summonIds);
      if (event.type === 'SUMMONED') {
        summonIds = [...new Set([...summonIds, event.entityId])];
      } else if (event.type === 'ALTAR_DESTROYED' && event.altarId === state.data.altarId) {
        destroyed = true;
      } else if (event.type === 'ENTITY_KILLED') {
        aliveIds = aliveIds.filter((id) => id !== event.entityId);
        summonIds = summonIds.filter((id) => id !== event.entityId);
      }
      const next = {
        ...state,
        progress: destroyed ? 1 : 0,
        data: { ...state.data, destroyed, aliveIds, summonIds },
      };
      return destroyed && aliveIds.length === 0 && summonIds.length === 0
        ? complete(next)
        : { state: next, commands: [] };
    },
  };
}

export const CHAPTER1_OBJECTIVES: Record<number, ObjectiveDefinition> = {
  1: createKeyExploreObjective(),
  2: createEliteHuntObjective(),
  3: createSingleAltarObjective(),
  4: createChaseObjective(),
  5: createBreakthroughObjective(),
  6: createWaveSurvivalObjective(),
  7: createBossObjective(),
};

export function getChapter1Objective(floor: number): ObjectiveDefinition {
  const value = CHAPTER1_OBJECTIVES[floor];
  if (!value) throw new Error('CHAPTER1_OBJECTIVE_NOT_FOUND');
  return value;
}
