import type {
  FloorChallengeMode,
  FloorChallengeSnapshot,
  MinghenLoadoutEntry,
  PveEquipmentLoadout,
  PveProfessionId,
} from './PveProgressionTypes';

export const FLOOR_RUNTIME_VERSION = 2 as const;
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
  /** 疾收·步 / 无踪撤步：剩余免费主动移动格数（不耗 AP、不增加连击）。 */
  rangerFreeMoveSteps: number;
  spiritBurstActive: boolean;
  spiritBurstExpiresAtTurn: number | null;
  archerBurstMoveGuard: boolean;
  archerBurstCoverPierce: boolean;
  rangerBurstActionsLeft: number;
  rangerBurstRepeatUsed: boolean;
}

export interface FrozenChallengeConfig {
  professionId: PveProfessionId;
  equipmentLoadout: PveEquipmentLoadout;
  minghenLoadout: MinghenLoadoutEntry[];
  trackedMinghenId: string | null;
  partnerId?: import('./partner/PartnerTypes').PartnerId | null;
  partnerEvolutionStage?: import('./partner/PartnerTypes').PartnerEvolutionStage;
  partnerLevel?: number;
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
    rangerFreeMoveSteps: 0,
    spiritBurstActive: false,
    spiritBurstExpiresAtTurn: null,
    archerBurstMoveGuard: false,
    archerBurstCoverPierce: false,
    rangerBurstActionsLeft: 0,
    rangerBurstRepeatUsed: false,
  };
}

export function freezeChallengeConfig(snapshot: FloorChallengeSnapshot): FrozenChallengeConfig {
  return {
    professionId: snapshot.config.professionId,
    equipmentLoadout: { ...snapshot.config.equipmentLoadout },
    minghenLoadout: snapshot.config.minghenLoadout.map((entry) => ({ ...entry })),
    trackedMinghenId: snapshot.config.trackedMinghenId,
    partnerId: snapshot.config.partnerId ?? null,
    partnerEvolutionStage: snapshot.config.partnerEvolutionStage ?? 1,
    partnerLevel: snapshot.config.partnerLevel ?? 1,
  };
}
