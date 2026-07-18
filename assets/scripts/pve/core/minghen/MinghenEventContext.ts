export const MINGHEN_HOOKS = [
  'TURN_START', 'TURN_END', 'BEFORE_MOVE', 'AFTER_MOVE', 'BEFORE_ATTACK', 'AFTER_ATTACK',
  'BEFORE_HIT', 'AFTER_HIT', 'KILL', 'DAMAGED', 'HEALED', 'SHIELD_BROKEN', 'STATUS_APPLIED',
  'STATUS_KILL', 'COLLISION', 'SPIRIT_BURST', 'TASK_INTERACT',
] as const;
export type MinghenHook = typeof MINGHEN_HOOKS[number];
export type MinghenStatus = 'BLEED' | 'POISON' | 'BURN' | 'CHILL';
export type MinghenAction = 'MOVE' | 'ATTACK';
export type MinghenTargetTier = 'NORMAL' | 'ELITE' | 'BOSS' | 'ANIMA';

export interface MinghenEventContext {
  eventId: string;
  hook: MinghenHook;
  turn: number;
  source: 'ACTIVE_ACTION' | 'STATUS' | 'TERRAIN' | 'ENVIRONMENT' | 'MINGHEN_SECONDARY' | 'ENEMY';
  apCost?: number;
  apLeft?: number;
  hp?: number;
  maxHp?: number;
  shield?: number;
  actualDamage?: number;
  actualHealing?: number;
  effectiveHealing?: number;
  overheal?: number;
  overkill?: number;
  targetId?: string;
  targetHpRatio?: number;
  targetHasStatus?: boolean;
  targetStatuses?: MinghenStatus[];
  appliedStatus?: MinghenStatus;
  activeMoveStepsThisTurn?: number;
  activeHitsOnTargetThisTurn?: number;
  movedThisTurn?: boolean;
  attackedThisTurn?: boolean;
  hitCount?: number;
  killed?: boolean;
  differentTarget?: boolean;
  collision?: boolean;
  enteredDangerousTerrain?: boolean;
  lastAction?: MinghenAction | null;
  action?: MinghenAction;
  voluntary?: boolean;
  attackerOnSandPit?: boolean;
  terrainDamage?: number;
  adjacentEnemyCount?: number;
  targetAdjacentEnemyCount?: number;
  enemiesInRange2?: number;
  adjacentToBlocking?: boolean;
  targetAdjacentToBlocking?: boolean;
  onExtraMoveCostTerrain?: boolean;
  extraMoveApCost?: number;
  environmentDamage?: number;
  inTaskObjectiveZone?: boolean;
  isTaskInteract?: boolean;
  escortUnitInRange2?: boolean;
  damageTargetIsEscort?: boolean;
  forcedDisplaceDistance?: number;
  collisionDamage?: number;
  inDangerTerrain?: boolean;
  inAttackWarningZone?: boolean;
  targetHasArmor?: boolean;
  targetTier?: MinghenTargetTier;
  shieldBefore?: number;
  shieldBrokenThisTurn?: boolean;
  playerStatusDuration?: number;
  playerStatusNumericEffect?: number;
  attackHadCollision?: boolean;
  bleedTriggeredByMove?: boolean;
  actualDamageBeforeMitigation?: number;
  damagedThisTurn?: boolean;
}

export interface MinghenEffectResult {
  damageMultiplierBonus: number;
  armorPenetrationBonus: number;
  apDelta: number;
  spiritGain: number;
  heal: number;
  shield: number;
  moveCostReduction: number;
  rangeBonus: number;
  applyStatuses: Array<{ id: MinghenStatus; stacks: number }>;
  secondaryDamageRatio: number;
  flags: string[];
  damageReductionRatio: number;
  forcedDisplaceReduction: number;
  transferDamageRatio: number;
  transferMaxTargets: number;
  consumeShieldRatioOfMaxHp: number;
  shieldToDamageRatio: number;
  refundConsumedShieldRatio: number;
  overflowDamageReductionRatio: number;
}

export function emptyMinghenEffectResult(): MinghenEffectResult {
  return {
    damageMultiplierBonus: 0,
    armorPenetrationBonus: 0,
    apDelta: 0,
    spiritGain: 0,
    heal: 0,
    shield: 0,
    moveCostReduction: 0,
    rangeBonus: 0,
    applyStatuses: [],
    secondaryDamageRatio: 0,
    flags: [],
    damageReductionRatio: 0,
    forcedDisplaceReduction: 0,
    transferDamageRatio: 0,
    transferMaxTargets: 0,
    consumeShieldRatioOfMaxHp: 0,
    shieldToDamageRatio: 0,
    refundConsumedShieldRatio: 0,
    overflowDamageReductionRatio: 0,
  };
}
