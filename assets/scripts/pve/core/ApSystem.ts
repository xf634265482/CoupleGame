// AP 行动点系统（design §4）：每回合 AP = 8 + 骰子(1~6) = 9~14；各类行动按固定值消耗。
// 纯函数：不持有状态，由 ExpeditionState/MovementSystem 等调用并落到 FloorState.ap。

import { AP_BASE, AP_COST, DICE_MAX, DICE_MIN } from './PveConstants';
import type { Rng } from './rng';

/** 可消耗 AP 的行动类型，与 PveConstants.AP_COST 的键一一对应。 */
export type ApAction = keyof typeof AP_COST;

/** 掷骰并计算本回合 AP 上限：AP = 8 + dice，dice ∈ [1,6] → AP ∈ [9,14]。 */
export function rollAp(rng: Rng): { dice: number; ap: number } {
  const dice = rng.int(DICE_MIN, DICE_MAX);
  return { dice, ap: AP_BASE + dice };
}

/** 行动固定消耗值。 */
export function costOf(action: ApAction): number {
  return AP_COST[action];
}

/** 当前 AP 是否足够支付该行动。 */
export function canAfford(ap: number, action: ApAction): boolean {
  return ap >= AP_COST[action];
}

/** 扣减 AP，返回扣减后的剩余值；AP 不足时抛错（调用方应先用 canAfford 校验）。 */
export function spend(ap: number, action: ApAction): number {
  const cost = AP_COST[action];
  if (ap < cost) {
    throw new Error(`ApSystem.spend: insufficient AP for ${action} (have ${ap}, need ${cost})`);
  }
  return ap - cost;
}

/** AP 是否已耗尽到无法再执行任何行动（含移动，最低消耗的行动也付不起）。 */
export function isExhausted(ap: number): boolean {
  const minCost = Math.min(...Object.values(AP_COST));
  return ap < minCost;
}
