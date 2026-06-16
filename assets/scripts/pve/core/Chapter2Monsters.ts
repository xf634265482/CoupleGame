// 第二章专属怪物工厂（沙漠废墟）。
// 数值已按 ×1.8 缩放后取整（普通层设计V1 §三）。
//
// 变体 id：
//   DESERT_RAIDER   — 普通怪：72HP/18攻/1射程，近战游击无特殊行为
//   SANDWORM_LARVA  — 普通怪：72HP/18攻/1射程，冲锋（CHASE 每回合移动 2 格）
//   POISON_SCORPION — 精英怪：144HP/36攻/1射程，命中玩家后中毒（8HP/回合×3回合，不叠加刷新）

import type { Coord, Monster } from './PveTypes';

export const VARIANT_DESERT_RAIDER = 'DESERT_RAIDER';
export const VARIANT_SANDWORM_LARVA = 'SANDWORM_LARVA';
export const VARIANT_POISON_SCORPION = 'POISON_SCORPION';

/** 沙漠劫匪（普通怪）：近战基础单位，无特殊行为。 */
export function makeDesertRaider(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_DESERT_RAIDER, pos,
    hp: 72, maxHp: 72, attack: 18, range: 1, aggroRadius: 3, aiState: 'IDLE',
  };
}

/** 沙虫幼体（普通怪）：冲锋——感知玩家后 CHASE 每回合移动 2 格。感知半径 2。 */
export function makeSandwormLarva(id: string, pos: Coord): Monster {
  return {
    id, type: 'NORMAL', variantId: VARIANT_SANDWORM_LARVA, pos,
    hp: 72, maxHp: 72, attack: 18, range: 1, aggroRadius: 2, aiState: 'IDLE',
  };
}

/** 毒蝎（精英怪）：命中玩家后施加中毒（8HP/回合×3回合，不叠加，刷新计时）。 */
export function makePoisonScorpion(id: string, pos: Coord): Monster {
  return {
    id, type: 'ELITE', variantId: VARIANT_POISON_SCORPION, pos,
    hp: 144, maxHp: 144, attack: 36, range: 1, aggroRadius: 4, aiState: 'IDLE',
  };
}
