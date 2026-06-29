import type { RunPlayer } from '../PveTypes';

export function payGoldWithTraits(player: RunPlayer, price: number): RunPlayer | undefined {
  if (player.gold >= price) return { ...player, gold: player.gold - price };
  if (!player.classTraits.includes('general_blood_price')) return undefined;
  const missingGold = price - player.gold;
  if (missingGold > Math.floor(price * 0.5)) return undefined;
  const hpCost = missingGold * 2;
  if (player.hp <= hpCost) return undefined;
  return { ...player, gold: 0, hp: player.hp - hpCost };
}
