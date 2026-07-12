export type RangerCountedAction = 'MOVE' | 'ATTACK';
export type RangerFinisher = 'QUICK_DAMAGE' | 'QUICK_MOVE' | 'SHADOW_END' | 'WHIRLWIND' | 'VANISH_STEP';
export interface RangerTurnState { combo: number; lastAction: RangerCountedAction | null; pendingAttackMultiplier: number; pendingArmorPenetration: number; }

export function createRangerState(): RangerTurnState { return { combo: 0, lastAction: null, pendingAttackMultiplier: 1, pendingArmorPenetration: 0 }; }
export function recordRangerAction(state: RangerTurnState, action: RangerCountedAction): RangerTurnState {
  return { ...state, combo: state.lastAction === action ? state.combo : state.combo + 1, lastAction: action };
}
export function endRangerTurn(): RangerTurnState { return createRangerState(); }

export function useRangerFinisher(state: RangerTurnState, finisher: RangerFinisher, masteryLevel: number) {
  const minimumCombo = finisher === 'SHADOW_END' || finisher === 'WHIRLWIND' ? 4 : 3;
  const requiredLevel = finisher === 'SHADOW_END' ? 3 : finisher === 'WHIRLWIND' ? 5 : finisher === 'VANISH_STEP' ? 7 : 1;
  if (masteryLevel < requiredLevel) return { valid: false as const, reason: 'TECHNIQUE_LOCKED' as const, state };
  if (state.combo < minimumCombo) return { valid: false as const, reason: 'COMBO_NOT_ENOUGH' as const, state };
  const next = { ...state, combo: 0, lastAction: null };
  if (finisher === 'QUICK_DAMAGE') { next.pendingAttackMultiplier = 1.25; }
  if (finisher === 'SHADOW_END') { next.pendingAttackMultiplier = 1.6; next.pendingArmorPenetration = 0.2; }
  return { valid: true as const, state: next, freeMoveRange: finisher === 'QUICK_MOVE' ? 1 : finisher === 'VANISH_STEP' ? 2 : 0, shieldMaxHpRatio: finisher === 'VANISH_STEP' ? 0.1 : 0, adjacentDamageMultiplier: finisher === 'WHIRLWIND' ? 0.55 : 0 };
}
