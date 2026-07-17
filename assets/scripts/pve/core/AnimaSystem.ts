import type { ApplyResult, ExpeditionState } from './PveTypes';

export function traitCount(traits: readonly string[], id: string): number {
  let count = 0;
  for (const trait of traits) if (trait === id) count++;
  return count;
}

/** Adds spirit energy outside permanent-floor mode. Permanent floors settle spirit separately. */
export function addAnima(state: ExpeditionState, amount: number): ApplyResult {
  if (amount <= 0 || state.persistentFloorMode) return { state, events: [] };
  const trinketBonus = state.player.equipment.TRINKET?.baseStat ?? 0;
  const actualAmount = trinketBonus > 0 ? Math.round(amount * (1 + trinketBonus / 100)) : amount;
  return {
    state: {
      ...state,
      player: {
        ...state.player,
        anima: state.player.anima + actualAmount,
        animaProgress: state.player.animaProgress + actualAmount,
      },
    },
    events: [],
  };
}
