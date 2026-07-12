import type {
  FloorChallengeMode,
  FloorChallengeSnapshot,
  MinghenLoadoutEntry,
  PveEquipmentLoadout,
  PveProfessionId,
} from './PveProgressionTypes';

export const FLOOR_RUNTIME_VERSION = 1 as const;
export const SPIRIT_MAX = 100 as const;

export type FloorRuntimeStatus = 'ACTIVE' | 'CLEAR' | 'DEAD' | 'WITHDRAW';
export type CombatStatusId = 'BLEED' | 'POISON' | 'BURN' | 'CHILL' | 'FROZEN';

export interface CombatStatusSnapshot {
  id: CombatStatusId;
  stacks: number;
  remainingTurns: number;
  sourcePower: number;
}

export interface FloorCombatResources {
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  spirit: number;
  shield: number;
  statuses: CombatStatusSnapshot[];
  temporaryEffects: string[];
}

export interface FloorChallengePlayerBaseline {
  maxHp: number;
  maxAp: number;
}

export interface FloorProfessionRuntimeState {
  warriorChargeLevel: number;
  archerAimLevel: number;
  archerMovedThisTurn: boolean;
  rangerCombo: number;
  rangerLastAction: 'MOVE' | 'ATTACK' | null;
  rangerPendingAttackMultiplier: number;
  rangerPendingArmorPenetration: number;
  spiritBurstActive: boolean;
}

export interface FrozenChallengeConfig {
  professionId: PveProfessionId;
  equipmentLoadout: PveEquipmentLoadout;
  minghenLoadout: MinghenLoadoutEntry[];
  trackedMinghenId: string | null;
}

export interface FloorChallengeRuntimeState<TBattleState = unknown> {
  version: typeof FLOOR_RUNTIME_VERSION;
  challengeId: string;
  floor: number;
  mode: FloorChallengeMode;
  seed: number;
  status: FloorRuntimeStatus;
  config: FrozenChallengeConfig;
  resources: FloorCombatResources;
  profession: FloorProfessionRuntimeState;
  turn: number;
  rngState: number;
  completedOptionalObjectiveIds: string[];
  battleState: TBattleState;
  startedAt: number;
  updatedAt: number;
}

export interface SerializedFloorChallenge<TBattleState = unknown> {
  version: typeof FLOOR_RUNTIME_VERSION;
  runtime: FloorChallengeRuntimeState<TBattleState>;
}

export function createFreshCombatResources(
  baseline: FloorChallengePlayerBaseline,
): FloorCombatResources {
  const maxHp = Math.max(1, Math.trunc(baseline.maxHp));
  const maxAp = Math.max(1, Math.trunc(baseline.maxAp));
  return {
    hp: maxHp,
    maxHp,
    ap: maxAp,
    maxAp,
    spirit: 0,
    shield: 0,
    statuses: [],
    temporaryEffects: [],
  };
}

export function createFreshProfessionState(): FloorProfessionRuntimeState {
  return {
    warriorChargeLevel: 0,
    archerAimLevel: 0,
    archerMovedThisTurn: false,
    rangerCombo: 0,
    rangerLastAction: null,
    rangerPendingAttackMultiplier: 1,
    rangerPendingArmorPenetration: 0,
    spiritBurstActive: false,
  };
}

export function freezeChallengeConfig(snapshot: FloorChallengeSnapshot): FrozenChallengeConfig {
  return {
    professionId: snapshot.config.professionId,
    equipmentLoadout: { ...snapshot.config.equipmentLoadout },
    minghenLoadout: snapshot.config.minghenLoadout.map((entry) => ({ ...entry })),
    trackedMinghenId: snapshot.config.trackedMinghenId,
  };
}
