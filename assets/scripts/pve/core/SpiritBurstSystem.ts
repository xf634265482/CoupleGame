import { SPIRIT_MAX, type FloorChallengeRuntimeState } from './FloorChallengeState';

export type SpiritGainEvent =
  | { type: 'ACTIVE_ATTACK_HIT'; finalApCost: number }
  | { type: 'PLAYER_DAMAGED'; actualDamage: number }
  | { type: 'ACTIVE_ATTACK_KILL'; targetRank: 'NORMAL' | 'ELITE' | 'CLIMAX' }
  | { type: 'KEY_OBJECTIVE'; firstForEntity: boolean }
  | { type: 'BOSS_PHASE'; firstForPhase: boolean };

export function calculateSpiritGain(event: SpiritGainEvent, maxHp: number): number {
  if (event.type === 'ACTIVE_ATTACK_HIT') return Math.min(14, 6 + Math.max(0, Math.trunc(event.finalApCost)));
  if (event.type === 'PLAYER_DAMAGED') return event.actualDamage <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(event.actualDamage / Math.max(1, maxHp) * 50)));
  if (event.type === 'ACTIVE_ATTACK_KILL') return event.targetRank === 'NORMAL' ? 8 : 15;
  if (event.type === 'KEY_OBJECTIVE') return event.firstForEntity ? 10 : 0;
  return event.firstForPhase ? 20 : 0;
}

export function gainSpirit<T>(state: FloorChallengeRuntimeState<T>, event: SpiritGainEvent, gainMultiplier = 1, now = Date.now()): FloorChallengeRuntimeState<T> {
  if (state.status !== 'ACTIVE') return state;
  const base = calculateSpiritGain(event, state.resources.maxHp);
  const gain = Math.max(0, Math.ceil(base * Math.max(0, gainMultiplier)));
  if (gain === 0 || state.resources.spirit >= SPIRIT_MAX) return state;
  return { ...state, resources: { ...state.resources, spirit: Math.min(SPIRIT_MAX, state.resources.spirit + gain) }, updatedAt: now };
}

export function gainSpiritFromAttack<T>(state: FloorChallengeRuntimeState<T>, summary: {
  hit: boolean;
  finalApCost: number;
  killedRanks: readonly ('NORMAL' | 'ELITE' | 'CLIMAX')[];
}, gainMultiplier = 1, now = Date.now()): FloorChallengeRuntimeState<T> {
  let next = state;
  if (summary.hit) next = gainSpirit(next, { type: 'ACTIVE_ATTACK_HIT', finalApCost: summary.finalApCost }, gainMultiplier, now);
  for (const rank of summary.killedRanks.slice(0, 2)) {
    next = gainSpirit(next, { type: 'ACTIVE_ATTACK_KILL', targetRank: rank }, gainMultiplier, now);
  }
  return next;
}

export function activateSpiritBurst<T>(state: FloorChallengeRuntimeState<T>, now = Date.now()): FloorChallengeRuntimeState<T> {
  if (state.status !== 'ACTIVE') throw new Error('FLOOR_RUNTIME_NOT_ACTIVE');
  if (state.resources.spirit < SPIRIT_MAX) throw new Error('SPIRIT_NOT_FULL');
  if (state.profession.spiritBurstActive) throw new Error('SPIRIT_BURST_ALREADY_ACTIVE');
  const profession = { ...state.profession, spiritBurstActive: true, spiritBurstExpiresAtTurn: state.turn };
  if (state.config.professionId === 'WARRIOR') profession.spiritBurstExpiresAtTurn = state.turn + 1;
  if (state.config.professionId === 'ARCHER') {
    profession.archerAimLevel = 3;
    profession.archerBurstMoveGuard = true;
    profession.archerBurstCoverPierce = true;
  }
  if (state.config.professionId === 'RANGER') {
    profession.rangerBurstActionsLeft = 4;
    profession.rangerBurstRepeatUsed = false;
  }
  return { ...state, resources: { ...state.resources, spirit: 0 }, profession, updatedAt: now };
}

export function clearSpiritBurst<T>(state: FloorChallengeRuntimeState<T>, now = Date.now()): FloorChallengeRuntimeState<T> {
  return {
    ...state,
    profession: {
      ...state.profession,
      spiritBurstActive: false,
      spiritBurstExpiresAtTurn: null,
      archerBurstMoveGuard: false,
      archerBurstCoverPierce: false,
      rangerBurstActionsLeft: 0,
      rangerBurstRepeatUsed: false,
    },
    updatedAt: now,
  };
}
