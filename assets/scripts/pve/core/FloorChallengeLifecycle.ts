import {
  FLOOR_RUNTIME_VERSION,
  createFreshCombatResources,
  createFreshProfessionState,
  freezeChallengeConfig,
  type FloorChallengePlayerBaseline,
  type FloorChallengeRuntimeState,
  type SerializedFloorChallenge,
} from './FloorChallengeState';
import type {
  FloorChallengeSnapshot,
  SettleFloorChallengeRequest,
} from './PveProgressionTypes';

function fail(message: string): never {
  throw new Error(message);
}

function requireActiveSnapshot(snapshot: FloorChallengeSnapshot): void {
  if (snapshot.status !== 'ACTIVE') fail('FLOOR_CHALLENGE_NOT_ACTIVE');
}

function requireActiveRuntime<T>(state: FloorChallengeRuntimeState<T>): void {
  if (state.status !== 'ACTIVE') fail('FLOOR_RUNTIME_NOT_ACTIVE');
}

export function startFloorRuntime<TBattleState>(
  snapshot: FloorChallengeSnapshot,
  baseline: FloorChallengePlayerBaseline,
  battleState: TBattleState,
  now = Date.now(),
): FloorChallengeRuntimeState<TBattleState> {
  requireActiveSnapshot(snapshot);
  return {
    version: FLOOR_RUNTIME_VERSION,
    challengeId: snapshot.challengeId,
    floor: snapshot.floor,
    mode: snapshot.mode,
    seed: snapshot.seed,
    status: 'ACTIVE',
    config: freezeChallengeConfig(snapshot),
    resources: createFreshCombatResources(baseline),
    profession: createFreshProfessionState(),
    turn: 1,
    rngState: snapshot.seed,
    completedOptionalObjectiveIds: [],
    battleState,
    startedAt: now,
    updatedAt: now,
  };
}

export function clearFloorRuntime<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
  completedOptionalObjectiveIds: readonly string[] = [],
  now = Date.now(),
): FloorChallengeRuntimeState<TBattleState> {
  requireActiveRuntime(state);
  return {
    ...state,
    status: 'CLEAR',
    resources: {
      ...state.resources,
      spirit: 0,
      shield: 0,
      statuses: [],
      temporaryEffects: [],
    },
    profession: createFreshProfessionState(),
    completedOptionalObjectiveIds: [...new Set(completedOptionalObjectiveIds)],
    updatedAt: now,
  };
}

export function applyFloorDeath<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
  now = Date.now(),
): FloorChallengeRuntimeState<TBattleState> {
  requireActiveRuntime(state);
  return {
    ...state,
    status: 'DEAD',
    resources: {
      ...state.resources,
      hp: 0,
      shield: 0,
      spirit: 0,
      temporaryEffects: [],
    },
    profession: createFreshProfessionState(),
    updatedAt: now,
  };
}

export function withdrawFloorRuntime<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
  now = Date.now(),
): FloorChallengeRuntimeState<TBattleState> {
  requireActiveRuntime(state);
  return {
    ...state,
    status: 'WITHDRAW',
    resources: {
      ...state.resources,
      spirit: 0,
      shield: 0,
      statuses: [],
      temporaryEffects: [],
    },
    profession: createFreshProfessionState(),
    updatedAt: now,
  };
}

export function resetRuntimeForLobby<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
  baseline: FloorChallengePlayerBaseline,
  now = Date.now(),
): FloorChallengeRuntimeState<TBattleState> {
  if (state.status === 'ACTIVE') fail('CANNOT_RESET_ACTIVE_FLOOR_RUNTIME');
  return {
    ...state,
    resources: createFreshCombatResources(baseline),
    profession: createFreshProfessionState(),
    turn: 1,
    updatedAt: now,
  };
}

export function buildFloorSettlementRequest<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
): SettleFloorChallengeRequest {
  if (state.status === 'ACTIVE') fail('CANNOT_SETTLE_ACTIVE_FLOOR_RUNTIME');
  return {
    challengeId: state.challengeId,
    status: state.status,
    ...(state.status === 'CLEAR' ? { clearTurns: Math.max(1, state.turn) } : {}),
    completedOptionalObjectiveIds: state.status === 'CLEAR'
      ? [...state.completedOptionalObjectiveIds]
      : [],
  };
}

export function serializeFloorRuntime<TBattleState>(
  state: FloorChallengeRuntimeState<TBattleState>,
): string {
  return JSON.stringify({ version: FLOOR_RUNTIME_VERSION, runtime: state });
}

export function resumeFloorRuntime<TBattleState>(
  snapshot: FloorChallengeSnapshot,
  serialized: string,
): FloorChallengeRuntimeState<TBattleState> {
  requireActiveSnapshot(snapshot);
  let parsed: SerializedFloorChallenge<TBattleState>;
  try {
    parsed = JSON.parse(serialized) as SerializedFloorChallenge<TBattleState>;
  } catch (_err) {
    return fail('INVALID_FLOOR_RUNTIME_SAVE');
  }
  if (parsed.version !== FLOOR_RUNTIME_VERSION || parsed.runtime?.version !== FLOOR_RUNTIME_VERSION) {
    return fail('FLOOR_RUNTIME_VERSION_MISMATCH');
  }
  const state = parsed.runtime;
  if (state.challengeId !== snapshot.challengeId
    || state.floor !== snapshot.floor
    || state.seed !== snapshot.seed
    || state.status !== 'ACTIVE') {
    return fail('FLOOR_RUNTIME_SNAPSHOT_MISMATCH');
  }
  if (JSON.stringify(state.config) !== JSON.stringify(freezeChallengeConfig(snapshot))) {
    return fail('FLOOR_RUNTIME_CONFIG_MISMATCH');
  }
  return {
    ...state,
    profession: {
      ...createFreshProfessionState(),
      ...state.profession,
    },
  };
}
